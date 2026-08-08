import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const EXPERIMENT_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(EXPERIMENT_ROOT, '..', '..');
const GENERATED_DIR = join(EXPERIMENT_ROOT, 'contracts', 'generated');
const PATCH_PATH = join(EXPERIMENT_ROOT, 'patches', 'experimental-contracts.patch');
const LOCK_PATH = join(EXPERIMENT_ROOT, 'spec', 'source-lock.json');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function commandOutput(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function verifySourceLock(lock) {
  const taggedCommit = commandOutput('git', ['rev-parse', `${lock.sourceTag}^{commit}`]);
  if (taggedCommit !== lock.sourceCommit) {
    throw new Error(`${lock.sourceTag} resolves to ${taggedCommit}, expected ${lock.sourceCommit}`);
  }

  for (const [source, expectedHash] of Object.entries(lock.files)) {
    const sourceBytes = await readFile(join(REPO_ROOT, source));
    if (sha256(sourceBytes) !== expectedHash) {
      throw new Error(`${source} no longer matches source-lock.json`);
    }
  }

  for (const [name, dependency] of Object.entries(lock.dependencies)) {
    const dependencyPath = join(REPO_ROOT, dependency.path);
    const repositoryRoot = commandOutput('git', ['rev-parse', '--show-toplevel'], {
      cwd: dependencyPath,
    });
    if (resolve(repositoryRoot) !== resolve(dependencyPath)) {
      throw new Error(`${name} is not an independently versioned repository at ${dependency.path}`);
    }
    const actualCommit = commandOutput('git', ['rev-parse', 'HEAD'], {
      cwd: dependencyPath,
    });
    if (actualCommit !== dependency.commit) {
      throw new Error(`${name} is at ${actualCommit}, expected ${dependency.commit} (${dependency.ref})`);
    }
  }

  const forgeVersion = commandOutput('forge', ['--version']);
  if (!forgeVersion.includes(`Version: ${lock.toolchain.foundryVersion}`)) {
    throw new Error(`Foundry version does not match ${lock.toolchain.foundryVersion}: ${forgeVersion}`);
  }
  if (!forgeVersion.includes(`Commit SHA: ${lock.toolchain.foundryCommit}`)) {
    throw new Error(`Foundry commit does not match ${lock.toolchain.foundryCommit}: ${forgeVersion}`);
  }
}

function replaceExact(source, before, after, expectedCount = 1) {
  const actualCount = source.split(before).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(`source drift: expected ${expectedCount} occurrence(s), found ${actualCount}: ${before.slice(0, 80)}`);
  }
  return source.split(before).join(after);
}

function transformFundToken(original) {
  let source = original;
  source = replaceExact(source, 'contract FundToken is ERC20, Pausable, AccessControl {', `contract ExperimentalFundToken is ERC20, Pausable, AccessControl {
    bool public immutable enforceAuthorized;
    bool public immutable enforceCompliance;
    bool public immutable enforceNAVValidity;
    bool public immutable enforceLifecycleStatus;
    bool public immutable enforceParameterConsistency;`);
  source = replaceExact(
    source,
    `    constructor(address admin, string memory name_, string memory symbol_, bytes32 fundId_, address navRegistry_)
        ERC20(name_, symbol_)
    {`,
    `    constructor(
        address admin,
        string memory name_,
        string memory symbol_,
        bytes32 fundId_,
        address navRegistry_,
        bool enforceAuthorized_,
        bool enforceCompliance_,
        bool enforceNAVValidity_,
        bool enforceLifecycleStatus_,
        bool enforceParameterConsistency_
    ) ERC20(name_, symbol_) {
        enforceAuthorized = enforceAuthorized_;
        enforceCompliance = enforceCompliance_;
        enforceNAVValidity = enforceNAVValidity_;
        enforceLifecycleStatus = enforceLifecycleStatus_;
        enforceParameterConsistency = enforceParameterConsistency_;`,
  );
  source = replaceExact(
    source,
    `    function pause() external onlyRole(PAUSER_ROLE) {`,
    `    modifier onlyRoleIfEnabled(bytes32 role) {
        if (enforceAuthorized) _checkRole(role);
        _;
    }

    function grantRole(bytes32 role, address account) public override {
        if (enforceAuthorized) _checkRole(getRoleAdmin(role));
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override {
        if (enforceAuthorized) _checkRole(getRoleAdmin(role));
        _revokeRole(role, account);
    }

    function pause() external onlyRoleIfEnabled(PAUSER_ROLE) {`,
  );
  source = replaceExact(source, 'external onlyRole(PAUSER_ROLE)', 'external onlyRoleIfEnabled(PAUSER_ROLE)', 1);
  source = replaceExact(source, 'external onlyRole(DEFAULT_ADMIN_ROLE)', 'external onlyRoleIfEnabled(DEFAULT_ADMIN_ROLE)', 2);
  source = replaceExact(source, 'onlyRole(SUBSCRIPTION_ROLE)', 'onlyRoleIfEnabled(SUBSCRIPTION_ROLE)', 2);
  source = replaceExact(source, 'onlyRole(REDEMPTION_ROLE)', 'onlyRoleIfEnabled(REDEMPTION_ROLE)', 3);
  source = replaceExact(
    source,
    '    function setWhitelisted(address investor, bool eligible, bytes32 vcHash) external onlyRoleIfEnabled(DEFAULT_ADMIN_ROLE) {',
    `    function setWhitelisted(address investor, bool eligible, bytes32 vcHash)
        external
        onlyRoleIfEnabled(DEFAULT_ADMIN_ROLE)
    {`,
  );

  source = replaceExact(
    source,
    '        require(!request.accepted, "SUBSCRIPTION_ALREADY_ACCEPTED");',
    '        if (enforceParameterConsistency) require(!request.accepted, "SUBSCRIPTION_ALREADY_ACCEPTED");',
  );
  source = replaceExact(
    source,
    '        require(whitelist[request.investor], "NOT_WHITELISTED");',
    '        if (enforceCompliance) require(whitelist[request.investor], "NOT_WHITELISTED");',
  );
  source = replaceExact(
    source,
    '        require(mintedShares > 0, "SUBSCRIPTION_TOO_SMALL");',
    '        if (enforceParameterConsistency) require(mintedShares > 0, "SUBSCRIPTION_TOO_SMALL");',
  );
  source = replaceExact(
    source,
    '        require(!request.settled, "REDEMPTION_ALREADY_SETTLED");',
    '        if (enforceParameterConsistency) require(!request.settled, "REDEMPTION_ALREADY_SETTLED");',
    2,
  );
  source = replaceExact(
    source,
    '        require(redemptionAmount > 0, "REDEMPTION_TOO_SMALL");',
    '        if (enforceParameterConsistency) require(redemptionAmount > 0, "REDEMPTION_TOO_SMALL");',
  );
  source = replaceExact(
    source,
    '        require(!request.delayed, "SETTLEMENT_ALREADY_DELAYED");',
    '        if (enforceParameterConsistency) require(!request.delayed, "SETTLEMENT_ALREADY_DELAYED");',
  );
  source = replaceExact(
    source,
    '        if (paused()) revert("PAUSED");',
    '        if (enforceLifecycleStatus && paused()) revert("PAUSED");',
  );
  source = replaceExact(
    source,
    '            require(whitelist[to], "RECEIVER_NOT_WHITELISTED");',
    '            if (enforceCompliance) require(whitelist[to], "RECEIVER_NOT_WHITELISTED");',
  );
  source = replaceExact(
    source,
    '        require(whitelist[investor], "NOT_WHITELISTED");',
    '        if (enforceCompliance) require(whitelist[investor], "NOT_WHITELISTED");',
    2,
  );
  source = replaceExact(
    source,
    '        require(subscriptionAmount > 0, "INVALID_SUBSCRIPTION_AMOUNT");',
    '        if (enforceParameterConsistency) require(subscriptionAmount > 0, "INVALID_SUBSCRIPTION_AMOUNT");',
  );
  source = replaceExact(
    source,
    '        require(redeemedShares > 0, "INVALID_REDEMPTION_AMOUNT");',
    '        if (enforceParameterConsistency) require(redeemedShares > 0, "INVALID_REDEMPTION_AMOUNT");',
  );
  source = replaceExact(
    source,
    '        require(balance >= queued, "INVALID_QUEUED_BALANCE");',
    '        if (enforceParameterConsistency) require(balance >= queued, "INVALID_QUEUED_BALANCE");',
  );
  source = replaceExact(
    source,
    '        require(balance - queued >= amount, "INSUFFICIENT_AVAILABLE_SHARES");',
    `        if (enforceParameterConsistency) {
            require(balance - queued >= amount, "INSUFFICIENT_AVAILABLE_SHARES");
        }`,
  );

  // The latest NAV read is intentionally retained. It is the preregistered
  // residual dependency for I10 when NAVValid is disabled.
  return source;
}

function transformNAVRegistry(original) {
  let source = original;
  source = replaceExact(source, 'contract NAVRegistry is AccessControl {', `contract ExperimentalNAVRegistry is AccessControl {
    bool public immutable enforceAuthorized;
    bool public immutable enforceNAVValidity;
    bool public immutable enforceParameterConsistency;`);
  source = replaceExact(
    source,
    `    constructor(address admin) {
        require(admin != address(0), "INVALID_ADMIN");`,
    `    constructor(address admin, bool enforceAuthorized_, bool enforceNAVValidity_, bool enforceParameterConsistency_) {
        require(admin != address(0), "INVALID_ADMIN");
        enforceAuthorized = enforceAuthorized_;
        enforceNAVValidity = enforceNAVValidity_;
        enforceParameterConsistency = enforceParameterConsistency_;`,
  );
  source = replaceExact(
    source,
    `    function postInitialNAV(bytes32 fundId, uint256 initialNav, uint64 asOf, bytes32 payloadHash)`,
    `    modifier onlyRoleIfEnabled(bytes32 role) {
        if (enforceAuthorized) _checkRole(role);
        _;
    }

    function grantRole(bytes32 role, address account) public override {
        if (enforceAuthorized) _checkRole(getRoleAdmin(role));
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override {
        if (enforceAuthorized) _checkRole(getRoleAdmin(role));
        _revokeRole(role, account);
    }

    function postInitialNAV(bytes32 fundId, uint256 initialNav, uint64 asOf, bytes32 payloadHash)`,
  );
  source = replaceExact(source, 'onlyRole(MANAGER_ROLE)', 'onlyRoleIfEnabled(MANAGER_ROLE)', 3);
  source = replaceExact(
    source,
    '        require(initialNav > 0, "INVALID_NAV");',
    '        if (enforceParameterConsistency) require(initialNav > 0, "INVALID_NAV");',
  );
  source = replaceExact(
    source,
    '        require(histories[fundId].length == 0, "NAV_ALREADY_INITIALIZED");',
    '        if (enforceNAVValidity) require(histories[fundId].length == 0, "NAV_ALREADY_INITIALIZED");',
  );
  source = replaceExact(
    source,
    '        require(histories[fundId].length > 0, "NAV_NOT_INITIALIZED");',
    '        if (enforceNAVValidity) require(histories[fundId].length > 0, "NAV_NOT_INITIALIZED");',
  );
  source = replaceExact(
    source,
    '        require(netAssetValue > 0, "INVALID_NET_ASSET_VALUE");',
    '        if (enforceParameterConsistency) require(netAssetValue > 0, "INVALID_NET_ASSET_VALUE");',
  );
  source = replaceExact(
    source,
    '        require(totalSharesSnapshot > 0, "INVALID_TOTAL_SHARES");',
    '        if (enforceParameterConsistency) require(totalSharesSnapshot > 0, "INVALID_TOTAL_SHARES");',
  );
  source = replaceExact(
    source,
    '        require(nav > 0, "INVALID_NAV");',
    '        if (enforceParameterConsistency) require(nav > 0, "INVALID_NAV");',
  );
  source = replaceExact(
    source,
    '        require(asOf > 0, "INVALID_AS_OF");',
    '        if (enforceNAVValidity) require(asOf > 0, "INVALID_AS_OF");',
  );
  source = replaceExact(
    source,
    '        require(asOf <= block.timestamp, "FUTURE_AS_OF");',
    '        if (enforceNAVValidity) require(asOf <= block.timestamp, "FUTURE_AS_OF");',
  );
  source = replaceExact(
    source,
    '            require(asOf >= history[history.length - 1].asOf, "AS_OF_BEFORE_LATEST");',
    '            if (enforceNAVValidity) require(asOf >= history[history.length - 1].asOf, "AS_OF_BEFORE_LATEST");',
  );
  return source;
}

function unifiedDiff(sourcePath, generatedPath, sourceLabel, generatedLabel) {
  const result = spawnSync('diff', ['-u', '--label', sourceLabel, '--label', generatedLabel, sourcePath, generatedPath], {
    encoding: 'utf8',
  });
  if (![0, 1].includes(result.status)) {
    throw new Error(`diff failed: ${result.stderr}`);
  }
  return result.stdout;
}

async function generate(targetDir) {
  const outputs = [];
  const definitions = [
    {
      source: 'contracts/src/FundToken.sol',
      output: 'ExperimentalFundToken.sol',
      transform: transformFundToken,
    },
    {
      source: 'contracts/src/NAVRegistry.sol',
      output: 'ExperimentalNAVRegistry.sol',
      transform: transformNAVRegistry,
    },
  ];

  await mkdir(targetDir, { recursive: true });
  for (const definition of definitions) {
    const sourcePath = join(REPO_ROOT, definition.source);
    const sourceBytes = await readFile(sourcePath);
    const generated = definition.transform(sourceBytes.toString('utf8'));
    const outputPath = join(targetDir, definition.output);
    await writeFile(outputPath, generated);
    outputs.push({ ...definition, sourcePath, outputPath, generated });
  }
  return outputs;
}

async function buildPatch(outputs) {
  const parts = [];
  for (const output of outputs) {
    parts.push(
      unifiedDiff(
        output.sourcePath,
        output.outputPath,
        output.source,
        relative(REPO_ROOT, join(GENERATED_DIR, output.output)),
      ),
    );
  }
  return parts.join('');
}

async function check() {
  const lock = JSON.parse(await readFile(LOCK_PATH, 'utf8'));
  await verifySourceLock(lock);
  const tempRoot = await mkdtemp(join(tmpdir(), 'paper85-contracts-'));
  try {
    const outputs = await generate(tempRoot);
    const expectedPatch = await buildPatch(outputs);
    for (const output of outputs) {
      const committed = await readFile(join(GENERATED_DIR, output.output), 'utf8');
      if (committed !== output.generated) throw new Error(`${output.output} is stale; regenerate experimental contracts`);
    }
    const committedPatch = await readFile(PATCH_PATH, 'utf8');
    if (committedPatch !== expectedPatch) throw new Error('experimental-contracts.patch is stale');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function write() {
  const lock = JSON.parse(await readFile(LOCK_PATH, 'utf8'));
  await verifySourceLock(lock);
  const outputs = await generate(GENERATED_DIR);
  const patch = await buildPatch(outputs);
  await mkdir(dirname(PATCH_PATH), { recursive: true });
  await writeFile(PATCH_PATH, patch);
  process.stdout.write(`${JSON.stringify({
    generated: outputs.map(({ output, generated }) => ({ file: output, sha256: sha256(generated) })),
    patchSha256: sha256(patch),
  }, null, 2)}\n`);
}

const mode = process.argv[2] ?? '--check';
if (mode === '--write') await write();
else if (mode === '--check') await check();
else throw new Error(`unknown mode: ${mode}`);
