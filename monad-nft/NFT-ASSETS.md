# NFT 资源与链上配置

## 概述

`QuickNFT` 合约内 **`MAX_SUPPLY = 11`**（`tokenId` **0～10**）。`baseURI` 须指向 **metadata 文件夹**（**必须以 `/` 结尾**），链上 `tokenURI(id)` = `baseURI` + 十进制 `id`，例如 `.../0`、`.../1`。

## 推荐 baseURI（Pinata 示例）

```
https://maroon-fast-porcupine-551.mypinata.cloud/ipfs/bafybeifkoejunfwym5hd5zezaxnzitqpcbhtn33ffxq6hutqc4cj3le27y/
```

每个 metadata JSON（无扩展名）至少包含：

- `name`、`description`
- `image`：完整 HTTPS 或 `ipfs://`，指向对应 `tokenId` 的图片

## 后端部署书籍时

在环境变量中设置 **`BASE_URI`**（或通过部署请求体传入 `baseURI`），与上列一致即可。参见 `backend/internal/handlers/factory.go` 中 `deployBookBaseURI`。

## 重新生成单文件合约（可选）

若需提交浏览器验证用的扁平化文件：

```bash
forge flatten src/BookFactory.sol -o BookFactory.flattened.sol
```
