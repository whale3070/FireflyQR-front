# Whale Vault — Original DApp for Revive & Polkadot 2.0

**Gasless NFT checkout for real-world goods — scan, claim, unlock. Built for cross-border merchants and the Polkadot 2.0 ecosystem.**

---

## 🪂 Deploy on Revive, Scale on Polkadot 2.0 — Hackathon

**Hot registration is open.**

- **🏆 $1000 USD prize pool**
- **Three tracks:** Revive Migration Challenge, Revive Native Tooling, **Original DApp Development**
- **This project:** **Original DApp Development**

| Item | Status |
|------|--------|
| **Live Demo** | _Add your demo URL here (e.g. Vercel / hackathon hosting)_ |
| **Demo Video** | _Add a 2–3 min Loom/YouTube link for judges_ |
| **Screenshots** | _Optional: add `./docs/screenshots/` or embed key UI images below_ |

---

## Why This DApp

**We lower the Web3 barrier for non-blockchain users** and serve real-world use cases:

- **Belt and Road & cross-border commerce** — Cross-border merchants and brands can issue and manage digital collectibles (NFTs) tied to physical goods (e.g. books) without requiring consumers to understand wallets or gas.
- **Multi-channel, multi-intermediary brands** — One backend supports many distributors and sales channels; redemption is code-based and relayed so end users get NFTs without holding native tokens first.
- **Consumers get a simple path to Web3** — Scan a QR code → enter an address (or connect a wallet) → receive an NFT and unlock digital perks (e.g. Arweave content, Matrix community). No prior crypto experience required.

Whale Vault is an **NFT vault and checkout DApp** built around **physical redemption codes (hash codes)**. It connects three sides:

- **Consumers:** Scan (WeChat or system camera) → open claim link → submit address → claim NFT → unlock Arweave content, Matrix community, and other digital benefits.
- **Cross-border merchants:** Use an admin dashboard for sales, finance, one-click withdraw, and batch code import.
- **Platform:** A Go relay layer provides **gasless claim** and handles rate limits and analytics.

---

## What We Built (Hackathon Deliverables)

- **End-to-end NFT redemption DApp** — Physical code (QR/link) → validate → gasless mint → success & content unlock.
- **Cross-border merchant admin** — Dashboard for sales, withdraw, batch code import; contract integration for `pull_funds()` and `add_book_batch`.
- **Secondary activate flow** — Consumer pays 1.1 native token to platform; backend verifies on-chain and mints a new NFT to the payer (no listing/buyer checks).
- **Revive / Polkadot 2.0–friendly stack** — EVM-compatible contracts and RPC; MetaMask (or other EVM wallets) for claim and secondary activate; backend relay for gasless UX and rate limiting.

---

## What’s in This Repo

- **Frontend:** React + Vite + Tailwind CSS (SPA).
- **Wallet & chain:** EVM-compatible (MetaMask, etc.) for claim and secondary activate; Polkadot{.js} and `@polkadot/api` available for Substrate/chain config where needed.
- **Backend:** Go relay server + Redis for stats, one-code-one-claim, and idempotency.

---

## Features Overview

### Consumer flow (checkout)

**Scan → validate code → enter address → confirm claim → success page → unlock content.**

- **Claim page** `/valut_mint_nft/:hashCode` (path kept for backward compatibility with existing QR codes)
  - QR code or link: `https://your-domain/valut_mint_nft/:hashCode`
  - Auto-validates code via `GET /secret/verify?codeHash=...`
  - Shows address input and “Confirm claim”; on success, calls `POST /relay/mint` and redirects to `/success`.

- **Success page** `/success`
  - NFT badge, wallet and book info.
  - “Verify access” calls contract `has_access(address, book_id)`.
  - On success: Arweave link and Matrix community entry.

### Admin (cross-border merchants)

Under `/admin`:

- **Overview** — Sales, mint count, withdrawable balance.
- **Monitor** — Trends and recent mints.
- **Sales** — Mint history (time, book_id, user, tx hash).
- **Withdraw** — Show balance and call contract `pull_funds()`.
- **Batch** — CSV import of `book_id, secret_code`; hashes and `add_book_batch(ids, hashes)` for bulk authorization.

---

## Tech Stack

### Frontend

- React 18, Vite, React Router v7, Tailwind CSS
- **EVM (Revive / compatible chain):** `ethers` v6, MetaMask (or any `window.ethereum`) for claim and secondary activate
- **Polkadot ecosystem:** `@polkadot/api`, `@polkadot/api-contract`, `@polkadot/extension-dapp` for optional Substrate integration
- Charts: Recharts, ECharts; effects: canvas-confetti

### Backend

- Go relay server (`backend/main.go`)
- Redis for rate limiting, one-time code locking, and mint logs
- CORS enabled for local and cross-origin frontend

---

## Install & Run

### Frontend

```bash
npm install
npm run dev
```

Default dev server: `http://localhost:5173`.

Build:

```bash
npm run build
```

Output: `dist/`.

### Backend

- Go 1.20+
- Redis (local or remote)

Environment (e.g. in `backend/.env`):

- `REDIS_ADDR` — default `127.0.0.1:6379`
- `RPC_URL`, `CHAIN_ID` — chain endpoint and ID
- `PRIVATE_KEY_0` / `RELAYER_PRIVATE_KEY` — relayer key for gasless mint
- `TREASURY_ADDRESS` or `SECONDARY_ACTIVATE_RECEIVER` — EOA for secondary-activate payments (see below)

```bash
cd backend
go run main.go
```

Default: `http://localhost:8080`.

---

## Main HTTP APIs

- **GET /secret/verify?codeHash=...** — Validate redemption code before claim.
- **POST /relay/mint** — Gasless claim; body: `book_address`, `consumer_address`, optional `code_hash` (one-code-one-claim).
- **GET /api/v1/nft/secondary-activate-receiver** — Returns the payment receiver address for “secondary activate” (1.1 native token).
- **POST /api/v1/nft/secondary-activate** — After user sends 1.1 native token to the receiver, backend verifies and mints a new NFT to that wallet.

---

## Contract Touchpoints (conceptual)

- `has_access(address, book_id)` — Success page access check.
- `pull_funds()` — Admin withdraw.
- `add_book_batch(ids, hashes)` — Batch authorization.
- `mint(address)` — Relayer mints to consumer (gasless flow).
- Secondary activate: user pays 1.1 native token to platform EOA; backend verifies and mints on the book sub-contract.

---

## Deployment (example: Nginx + Go)

1. Build frontend: `npm run build`; serve `dist/` (e.g. `/var/www/whale-vault`).
2. Point frontend config to your backend URL (e.g. `BACKEND_URL` or `apiBaseUrl`).
3. Run backend: `cd backend && go run main.go` (or a binary), listening on `:8080`.
4. Nginx: reverse proxy `/relay/`, `/secret/`, `/api/` to `http://127.0.0.1:8080`; SPA `try_files $uri $uri/ /index.html` for `/`.

---

## Hackathon & Track

- **Event:** Deploy on Revive, Scale on Polkadot 2.0  
- **Track:** **Original DApp Development**  
- **Focus:** Lowering Web3 barriers; supporting Belt and Road, cross-border merchants, and multi-channel brands with code-based NFT redemption and gasless UX.

---

## Roadmap (Post–Hackathon)

- Replace any remaining mock data with on-chain and backend APIs.
- Optional: multi-chain config (e.g. switch between Revive testnet/mainnet).
- Optional: publisher/merchant role and permission controls in the admin.
- Optional: integration tests and CI for contract + backend.

---

## Why This Deserves a Prize (Summary for Judges)

- **Real-world impact:** Targets non-crypto users (Belt and Road, cross-border merchants, multi-channel brands) with scan-to-claim and gasless mint — no wallet setup or gas required for first claim.
- **Complete DApp:** Frontend (claim + admin), Go backend (relay, rate limit, one-code-one-claim), smart contracts (mint, withdraw, batch, secondary activate), and deploy docs.
- **Polkadot 2.0 / Revive aligned:** EVM-compatible design suitable for Revive; clear path to Polkadot ecosystem tooling and multi-chain scaling.
- **Original DApp track fit:** Novel use case (physical redemption → NFT + content unlock) and production-oriented architecture (Redis, env config, Nginx example).

---

## License & Contact

See repository license. For questions or collaboration, open an issue or reach out via the hackathon channels.
