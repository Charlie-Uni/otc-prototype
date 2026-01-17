import 'dotenv/config';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';


const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: foundry, transport: http(process.env.RPC_URL!) });
const rpc = createPublicClient({ chain: foundry, transport: http(process.env.RPC_URL!) });


async function main(){
    // In a real script you’d deploy bytecode/abi produced by forge. Here we assume Foundry script used.
    console.log('Use Foundry Deploy.s.sol or viem deploy with compiled artifacts.');
}
main();