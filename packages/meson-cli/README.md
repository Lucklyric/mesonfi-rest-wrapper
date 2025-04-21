# MesonFi Bridge CLI

A TypeScript CLI for interacting with the MesonFi cross-chain bridge API.

## Quick Setup

```bash
# Install dependencies
yarn install

# Build the TypeScript code
yarn build
```

## Usage

### Standard Bridge Command

Bridge tokens directly via the MesonFi API:

```bash
yarn bridge --from <chain:token> --to <chain:token> --amount <value> --recipient <address> [options]
```

### Contract-Based Bridge Command

Bridge tokens through a contract (useful for native token bridging):

```bash
yarn bridge-contract --from <chain:token> --to <chain:token> --amount <value> --recipient <address> --rpc-url <url> [options]
```

## Examples

### Standard Bridge Example

```bash
# Bridge 100 USDC from Ethereum to BSC
yarn bridge --from eth:usdc --to bsc:usdc --amount 100 --recipient 0x456...
```

### Contract Bridge Example

```bash
# Bridge 0.001 ETH from Base to Blast
yarn bridge-contract --from base:eth --to blast:eth --amount 0.001 --recipient 0x{....} --rpc-url https://base.llamarpc.com --debug --deploy-if-missing
```

Once the transaction is submitted, you can track your swap using the provided link:
```
Track status on Meson Explorer: https://explorer.meson.fi/swap/0x{....}
```

## Command Options

### Common Options

* `--from <chain:token>` - Source chain and token (e.g., 'base:eth')
* `--to <chain:token>` - Destination chain and token (e.g., 'blast:eth')
* `--amount <value>` - Amount to bridge
* `--recipient <address>` - Recipient address on the destination chain
* `--private-key <key>` - Private key for signing (can also be set via PRIVATE_KEY env var)
* `--dry-run` - Execute all steps without submitting the final transaction
* `--debug` - Enable debug logging

### Contract Bridge Specific Options

* `--rpc-url <url>` - RPC URL for the source chain
* `--meson-contract <address>` - Address of the Meson contract (optional, will be looked up from chain data)
* `--transfer-contract <address>` - Address of your deployed TransferToMeson contract (optional)
* `--deploy-if-missing` - Deploy a new TransferToMeson contract if one is not provided 