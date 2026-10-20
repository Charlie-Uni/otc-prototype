"""Check Table 11 lineage and deployment inputs without rerunning benchmarks.

Usage: python tools/audit-paper85-followup.py RUN_DIR OUTPUT.json
Only the output report is written; both historical and sealed evidence are read.
"""
import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
run, output = (Path(p).resolve() for p in sys.argv[1:])
old = ROOT / 'docs/evidence/paper85/v3'
inputs = {}


def read(path):
    data = path.read_bytes()
    inputs[str(path.relative_to(ROOT))] = hashlib.sha256(data).hexdigest()
    return gzip.decompress(data) if path.suffix == '.gz' else data


def load(path):
    return json.loads(read(path))


def tape(path):
    return [json.loads(line) for line in read(path).splitlines()]


def data_cost(data):
    return 4 * data.count(0) + 16 * (len(data) - data.count(0))


manifest = load(run / 'manifest.json')
assert manifest['status'] == 'complete'
for name, digest in manifest['files'].items():
    assert hashlib.sha256((run / name).read_bytes()).hexdigest() == digest, name
summary = load(run / 'B-scale-summary.json')
report = {'schema': 1, 'kind': 'post-review verification of existing archived measurements',
          'measurementCommit': summary['provenance']['commit'], 'run': str(run.relative_to(ROOT)),
          'sealedFilesVerified': len(manifest['files']), 'scaleRuns': []}
fields = ['transactions', 'acceptedEvents', 'eventsByType', 'operationsByType', 'gas', 'storage', 'eventIndex']
for filename in summary['runFiles']:
    previous, current = load(old / filename), load(run / filename)
    replay = load(run / current['evidence'])
    transactions = {t['receipt']['transactionHash']: t for t in tape(run / replay['chainTape']) if t['kind'] == 'transaction'}
    assert len(replay['operations']) == current['transactions']
    receipt_gas = sum(int(transactions[op['transactionHash']]['receipt']['gasUsed']) for op in replay['operations'])
    assert receipt_gas == current['gas']['total']
    assert len(replay['rawLogs']) == current['acceptedEvents']
    assert len(replay['normalizedJsonl'].encode()) == current['eventIndex']['normalizedJsonlBytes']
    navs = [e for e in replay['decoded'] if e['eventName'] == 'NAVUpdatedEvent']
    changes = []
    for event in navs:
        at = int(event['args']['asOf'])
        assert at == int(event['args']['storedAt'])
        tx = transactions[event['transactionHash']]
        assert at == int(tx['block']['timestamp'], 16)
        delta = data_cost(at.to_bytes(32, 'big')) - data_cost((at - 60).to_bytes(32, 'big'))
        if delta:
            changes.append({'transactionHash': event['transactionHash'], 'blockNumber': event['blockNumber'],
                            'asOf': at, 'oldCodeAsOf': at - 60, 'inputDataGasDelta': delta})
    gas_delta = current['gas']['total'] - previous['gas']['total']
    assert gas_delta == sum(c['inputDataGasDelta'] for c in changes)
    assert previous['correctness']['finalProjectionSha256'] != current['correctness']['finalProjectionSha256']
    report['scaleRuns'].append({'file': filename, 'evidence': current['evidence'], 'chainTape': replay['chainTape'],
        'equalToHistorical': {key: previous[key] == current[key] for key in fields},
        'oldTotalGas': previous['gas']['total'], 'newReceiptTotalGas': receipt_gas, 'totalGasDelta': gas_delta,
        'alignedNavEvents': len(navs), 'timestampDataChanges': changes, 'finalProjectionHashChanged': True})

metrics = [(key, 0, 1) for key in ['transactions', 'acceptedEvents', 'gasPerTransaction', 'gasPerEvent', 'storageSlots']]
metrics += [('storageSlotsPerTransaction', 2, 1), ('rawPayloadBytes', 1, 1024), ('rawPayloadBytesPerEvent', 1, 1), ('normalizedJsonlBytes', 1, 1024)]
previous_summary = load(old / 'B-scale-summary.json')
report['table11DeterministicCells'] = []
for before, after in zip(previous_summary['aggregate'], summary['aggregate']):
    for key, digits, divisor in metrics:
        format_cell = lambda v: f"{v['mean'] / divisor:,.{digits}f} ± {v['sd'] / divisor:,.{digits}f}"
        assert format_cell(before[key]) == format_cell(after[key])
        report['table11DeterministicCells'].append({'target': after['target'], 'metric': key,
            'newDisplayedValue': format_cell(after[key]), 'sameDisplayAsHistorical': True})

fund = load(run / 'build/FundToken.artifact.json')
creation = bytes.fromhex(fund['bytecode']['object'][2:])
deployments = {}
for label, chain in [('canonical', 'chains/canonical-19100.jsonl.gz'), ('scale', report['scaleRuns'][0]['chainTape'])]:
    tx = next(t for t in tape(run / chain) if t['kind'] == 'transaction' and t['transaction']['input'][2:].startswith(creation.hex()))
    data = bytes.fromhex(tx['transaction']['input'][2:])
    args = data[len(creation):]
    def string_arg(index):
        offset = int.from_bytes(args[index * 32:(index + 1) * 32])
        length = int.from_bytes(args[offset:offset + 32])
        return args[offset + 32:offset + 32 + length].decode()
    deployments[label] = {'chainTape': chain, 'transactionHash': tx['receipt']['transactionHash'],
        'gasUsed': int(tx['receipt']['gasUsed']), 'inputBytes': len(data), 'creationBytecodeSha256': hashlib.sha256(creation).hexdigest(),
        'constructorZeroBytes': args.count(0), 'inputDataGas': data_cost(data),
        'name': string_arg(1), 'symbol': string_arg(2), 'fundId': '0x' + args[96:128].hex()}
delta = deployments['canonical']['gasUsed'] - deployments['scale']['gasUsed']
assert delta == deployments['canonical']['inputDataGas'] - deployments['scale']['inputDataGas'] == 12
old_a, new_a = load(old / 'A-summary.json'), load(run / 'A-summary.json')
b2_before = old_a['comparatorGas']['B2']['deploymentGas'][0]
b2_after = new_a['comparatorGas']['B2']['deploymentGas'][0]
assert b2_after - b2_before == 12
report['deployment'] = {'FundToken': {'inputs': deployments, 'gasDifference': delta,
    'finding': 'Same archived creation bytecode, different constructor arguments. Canonical input has one fewer zero byte; input data cost accounts for all 12 gas. This comparison is not evidence of a metadata change.'},
    'B2': {'oldGas': b2_before, 'newGas': b2_after, 'gasDifference': b2_after - b2_before,
           'originalV3CreationInputArchived': False,
           'finding': 'A metadata zero-byte change is compatible with 12 gas but is unconfirmed: original v3 archived no creation input or compiled artifact. Equal length alone cannot establish the cause.'}}
report['sources'] = {'metadata': 'https://docs.soliditylang.org/en/v0.8.30/metadata.html',
                     'inputDataGas': 'https://eips.ethereum.org/EIPS/eip-7623'}
report['inputs'] = inputs
report['verifierSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'report': str(output), 'runs': len(report['scaleRuns']),
                  'alignedNavEvents': sum(r['alignedNavEvents'] for r in report['scaleRuns']),
                  'unchangedDisplayedCells': len(report['table11DeterministicCells']), 'deploymentGasDifference': delta}))
