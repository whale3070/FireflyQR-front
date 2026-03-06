# BookNFT - 书籍 NFT 押金流转平台

基于 Avalanche 的书籍 NFT 平台，支持 Relayer 代付 + 押金流转机制。

## 架构

```
BookFactory（工厂合约）
  └── deployBook() → 创建 QuickNFT 子合约（每本书一个独立 ERC-721）
                        ├── mint()          → Relayer 代付，铸造 NFT 给读者
                        ├── listForSale()   → 持有者挂售
                        ├── buyWithPledge() → 买家付押金购买，旧押金退给卖家
                        └── cancelListing() → 取消挂售
```

## 合约说明

| 合约 | 功能 |
|------|------|
| `BookFactory` | 工厂合约，出版社付 0.01 AVAX 部署新书 |
| `QuickNFT` | 书籍 NFT 合约 (ERC-721)，支持押金锁定与流转 |

## 环境准备

```bash
# 安装依赖
forge install

# 编译
forge build

# 测试
forge test -vvv
```

配置 `.env` 文件：

```env
PRIVATE_KEY_0=0x你的私钥
DEPLOYER=0x你的地址
Avanlche_Test_RPC=https://avalanche-fuji.blockpi.network/v1/rpc/你的key
FACTORY_ADDR=           # 部署后填入
BOOK1_ADDRESS=          # 创建书籍后填入
TEST1_ADDRESS=          # 测试用户1地址
TEST1_PRIVATEKEY=       # 测试用户1私钥
TEST2_ADDRESS=          # 测试用户2地址
TEST2_PRIVATEKEY=       # 测试用户2私钥
```

---

## 完整测试流程

### Step 0: 加载环境变量

```bash
source .env
```

### Step 1: 部署工厂合约

```bash
# 模拟部署（验证无误）
forge script script/DeployBookFactory.s.sol:DeployBookFactory \
  --rpc-url $Avanlche_Test_RPC -vvvv

# 正式部署
forge script script/DeployBookFactory.s.sol:DeployBookFactory \
  --rpc-url $Avanlche_Test_RPC --broadcast -vvvv
```

部署成功后，将工厂合约地址写入 `.env` 的 `FACTORY_ADDR`，然后重新 `source .env`。

### Step 2: 创建一本书

```bash
cast send $FACTORY_ADDR \
  "deployBook(string,string,string,string,address,uint256)" \
  "MySUIBook" "MBK" "0Xlayer" "https://skills.sh/0xlayerghost/solidity-agent-kit/solidity-coding" $DEPLOYER 0 \
  --value 0.01ether \
  --rpc-url $Avanlche_Test_RPC \
  --private-key $PRIVATE_KEY_0
```

参数说明：
- `"MySUIBook"` - 书名（NFT name）
- `"MBK"` - 符号（NFT symbol）
- `"0Xlayer"` - 作者名
- `"https://..."` - baseURI（元数据地址）
- `$DEPLOYER` - Relayer 地址（代付授权）
- `0` - 押金金额（0 = 无押金模式）
- `--value 0.01ether` - 部署费，付给平台 treasury

### Step 3: 查询书籍信息

```bash
# 查询已部署的书籍总数
cast call $FACTORY_ADDR "totalBooks()(uint256)" \
  --rpc-url $Avanlche_Test_RPC

# 查询第一本书的合约地址（索引从 0 开始）
cast call $FACTORY_ADDR "deployedBooks(uint256)(address)" 0 \
  --rpc-url $Avanlche_Test_RPC
```

将书籍合约地址写入 `.env` 的 `BOOK1_ADDRESS`，然后重新 `source .env`。

### Step 4: 创建测试用户

```bash
# 创建两个测试钱包
cast wallet new
cast wallet new
```

将地址和私钥分别写入 `.env` 的 `TEST1_ADDRESS`/`TEST1_PRIVATEKEY` 和 `TEST2_ADDRESS`/`TEST2_PRIVATEKEY`，然后重新 `source .env`。

### Step 5: 给测试用户转 gas 费

```bash
# 给 TEST1 转 0.2 AVAX
cast send $TEST1_ADDRESS \
  --value 0.2ether \
  --rpc-url $Avanlche_Test_RPC \
  --private-key $PRIVATE_KEY_0

# 给 TEST2 转 0.2 AVAX
cast send $TEST2_ADDRESS \
  --value 0.2ether \
  --rpc-url $Avanlche_Test_RPC \
  --private-key $PRIVATE_KEY_0
```

### Step 6: Mint NFT 给测试用户

```bash
# 给 TEST1 铸造一个书籍 NFT（Relayer 代付）
cast send $BOOK1_ADDRESS \
  "mint(address)" $TEST1_ADDRESS \
  --value 0 \
  --rpc-url $Avanlche_Test_RPC \
  --private-key $PRIVATE_KEY_0

# 给 TEST2 铸造一个书籍 NFT
cast send $BOOK1_ADDRESS \
  "mint(address)" $TEST2_ADDRESS \
  --value 0 \
  --rpc-url $Avanlche_Test_RPC \
  --private-key $PRIVATE_KEY_0
```

> **注意**：mint 必须用 `PRIVATE_KEY_0`（授权的 Relayer），普通用户直接调用会报 `NotAuthorized`。

### Step 7: 查询 NFT 持有情况

```bash
# 查询 TEST1 持有的 NFT 数量
cast call $BOOK1_ADDRESS "balanceOf(address)(uint256)" $TEST1_ADDRESS \
  --rpc-url $Avanlche_Test_RPC

# 查询 TEST2 持有的 NFT 数量
cast call $BOOK1_ADDRESS "balanceOf(address)(uint256)" $TEST2_ADDRESS \
  --rpc-url $Avanlche_Test_RPC

# 查询 tokenId=0 的持有者
cast call $BOOK1_ADDRESS "ownerOf(uint256)(address)" 0 \
  --rpc-url $Avanlche_Test_RPC

# 查询已铸造总数
cast call $BOOK1_ADDRESS "totalSales()(uint256)" \
  --rpc-url $Avanlche_Test_RPC
```

### Step 8: 挂售 NFT（二手流转）

```bash
# TEST1 将 tokenId=0 挂售
cast send $BOOK1_ADDRESS \
  "listForSale(uint256)" 0 \
  --rpc-url $Avanlche_Test_RPC \
  --private-key $TEST1_PRIVATEKEY

# 查询是否挂售中
cast call $BOOK1_ADDRESS "listedForSale(uint256)(bool)" 0 \
  --rpc-url $Avanlche_Test_RPC
```

### Step 9: 购买挂售的 NFT

```bash
# TEST2 购买 TEST1 挂售的 tokenId=0（pledgeAmount=0 时 value=0）
cast send $BOOK1_ADDRESS \
  "buyWithPledge(uint256)" 0 \
  --value 0 \
  --rpc-url $Avanlche_Test_RPC \
  --private-key $TEST2_PRIVATEKEY
```

### Step 10: 验证转移结果

```bash
# tokenId=0 现在应该属于 TEST2
cast call $BOOK1_ADDRESS "ownerOf(uint256)(address)" 0 \
  --rpc-url $Avanlche_Test_RPC

# TEST1 余额应为 0，TEST2 余额应为 2
cast call $BOOK1_ADDRESS "balanceOf(address)(uint256)" $TEST1_ADDRESS \
  --rpc-url $Avanlche_Test_RPC
cast call $BOOK1_ADDRESS "balanceOf(address)(uint256)" $TEST2_ADDRESS \
  --rpc-url $Avanlche_Test_RPC
```

---

## 管理员操作

```bash
# 添加新的 Relayer
cast send $BOOK1_ADDRESS \
  "setRelayer(address,bool)" <NEW_RELAYER_ADDR> true \
  --rpc-url $Avanlche_Test_RPC \
  --private-key $PRIVATE_KEY_0

# 修改部署费用（单位 wei，例如 0.02 AVAX = 20000000000000000）
cast send $FACTORY_ADDR \
  "updateDeployFee(uint256)" 20000000000000000 \
  --rpc-url $Avanlche_Test_RPC \
  --private-key $PRIVATE_KEY_0

# 紧急提取合约余额（仅 publisher）
cast send $BOOK1_ADDRESS \
  "emergencyWithdraw()" \
  --rpc-url $Avanlche_Test_RPC \
  --private-key $PRIVATE_KEY_0
```

## 合约验证（开源）

```bash
# 验证 BookFactory 合约
forge verify-contract $FACTORY_ADDR src/BookFactory.sol:BookFactory \
  --chain 43113 \
  --rpc-url $Avanlche_Test_RPC \
  --constructor-args $(cast abi-encode "constructor(address,uint256)" $DEPLOYER 10000000000000000) \
  --verifier-url "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan" \
  --etherscan-api-key "verifyContract"

# 验证 QuickNFT 子合约
forge verify-contract $BOOK1_ADDRESS src/QuickNFT.sol:QuickNFT \
  --chain 43113 \
  --rpc-url $Avanlche_Test_RPC \
  --constructor-args $(cast abi-encode "constructor(string,string,string,address,string,address,uint256)" "MySUIBook" "MBK" "0Xlayer" $DEPLOYER "https://skills.sh/0xlayerghost/solidity-agent-kit/solidity-coding" $DEPLOYER 0) \
  --verifier-url "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan" \
  --etherscan-api-key "verifyContract"

# 检查验证状态
forge verify-check <GUID> \
  --chain 43113 \
  --verifier-url "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan" \
  --etherscan-api-key "verifyContract"
```

> Avalanche Fuji 测试网使用 Routescan 作为区块链浏览器验证服务，`etherscan-api-key` 填 `"verifyContract"` 即可。

## 区块链浏览器

- 查看交易：`https://testnet.snowtrace.io/tx/<TX_HASH>`
- 查看合约：`https://testnet.snowtrace.io/address/<CONTRACT_ADDR>`

## 网络信息

| 项目 | 值 |
|------|-----|
| 网络 | Avalanche Fuji Testnet |
| Chain ID | 43113 |
| 测试币水龙头 | https://faucet.avax.network/ |

工厂合约
https://testnet.snowscan.xyz/address/0x5951d5558De12aCD4fA603550DFf2771b5317F04

Book合约
https://testnet.snowscan.xyz/address/0x58812f033f552693b69d9F83DC93a178f9fcf35f
