#!/usr/bin/env bash
set -euo pipefail

# =========================
# Whale Vault Frontend Deploy
# =========================
#
# 模式（默认 dev，不每次编译）：
#   dev  — 跳过 npm run build；默认也跳过 npm install（沿用已有 dist + node_modules）
#   prod — npm ci/install + npm run build + 同步 dist → WEB_ROOT
#
# 用法示例：
#   ./whale-deploy.sh
#   WHALE_DEPLOY_MODE=prod ./whale-deploy.sh
#   SKIP_NPM_INSTALL=0 ./whale-deploy.sh   # dev 下仍要装依赖时
#

# 限制 Node 内存，防止 npm install / npm run build 吃满内存导致服务器卡死
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=1024"

# 1) 项目路径（你现在的真实路径）
SOURCE_DIR="/root/git-connect-helper-edbe1c7c"
DIST_DIR="$SOURCE_DIR/dist"

# 2) Nginx 站点根目录（与你 nginx.conf 的 root 保持一致）
WEB_ROOT="/var/www/whale-vault"

# 3) 是否把 public/403.html 复制到站点根（可选）
COPY_403_HTML="true"

# 4) 部署模式：prod | dev（默认 dev = 不跑 build，部署更快）
WHALE_DEPLOY_MODE="${WHALE_DEPLOY_MODE:-dev}"

# 是否跳过 npm install/ci：dev 默认跳过；prod 默认不跳过。要装依赖：SKIP_NPM_INSTALL=0 ./whale-deploy.sh
if [ "$WHALE_DEPLOY_MODE" = "dev" ]; then
  SKIP_NPM_INSTALL="${SKIP_NPM_INSTALL:-1}"
else
  SKIP_NPM_INSTALL="${SKIP_NPM_INSTALL:-0}"
fi

echo "🚀 [Whale3070] 开始部署..."
echo "   - SOURCE_DIR: $SOURCE_DIR"
echo "   - DIST_DIR:   $DIST_DIR"
echo "   - WEB_ROOT:   $WEB_ROOT"
echo "   - WHALE_DEPLOY_MODE: $WHALE_DEPLOY_MODE"
echo "   - SKIP_NPM_INSTALL: $SKIP_NPM_INSTALL"
echo "   - NODE_OPTIONS: $NODE_OPTIONS (限制 Node 内存防卡死)"

# 0. 前置检查
if [ ! -d "$SOURCE_DIR" ]; then
  echo "❌ 错误：SOURCE_DIR 不存在：$SOURCE_DIR"
  exit 1
fi

cd "$SOURCE_DIR"

# 1. 依赖与构建（dev：默认跳过构建与 install，仅同步已有 dist）
FREE_MB=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo "0")
if [ "$FREE_MB" -lt 800 ] 2>/dev/null; then
  echo "⚠️ 当前可用内存约 ${FREE_MB}MB，建议至少 800MB 可用或增加 swap，否则可能卡死。"
fi

if [ "$WHALE_DEPLOY_MODE" = "dev" ]; then
  echo "🔧 DEV 模式：跳过 npm run build（不每次编译）。"
  if [ "$SKIP_NPM_INSTALL" = "1" ]; then
    echo "⏭️  跳过 npm install/ci（更新依赖请执行：SKIP_NPM_INSTALL=0 $0）"
  else
    echo "📦 执行依赖安装（SKIP_NPM_INSTALL=0）..."
    if [ -f "package-lock.json" ]; then
      npm ci
    else
      npm install
    fi
  fi
else
  echo "📦 PROD 模式：依赖安装 + 前端构建..."
  if [ "$SKIP_NPM_INSTALL" = "1" ]; then
    echo "⏭️  跳过 npm install/ci（SKIP_NPM_INSTALL=1）"
  elif [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi
  npm run build
fi

# 2. 检查 dist（dev 模式不会现场构建，须已有产物）
if [ ! -d "$DIST_DIR" ]; then
  echo "❌ 错误：dist 目录不存在。"
  if [ "$WHALE_DEPLOY_MODE" = "dev" ]; then
    echo "   dev 模式未执行构建。请先在本机执行：npm run build"
    echo "   或完整发布：WHALE_DEPLOY_MODE=prod $0"
  else
    echo "   prod 构建可能失败，请查看上方 npm 输出。"
  fi
  exit 1
fi

if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "❌ 错误：dist/index.html 不存在。"
  if [ "$WHALE_DEPLOY_MODE" = "dev" ]; then
    echo "   请先 npm run build 或 WHALE_DEPLOY_MODE=prod $0"
  fi
  exit 1
fi

# 3. 准备站点目录
echo "📁 正在准备站点目录..."
sudo mkdir -p "$WEB_ROOT"

# 4. 回滚保护：先备份当前线上版本
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/var/www/.whale-vault-backup_$STAMP"
if [ -d "$WEB_ROOT" ] && [ "$(ls -A "$WEB_ROOT" 2>/dev/null || true)" != "" ]; then
  echo "🧯 备份当前线上文件到：$BACKUP_DIR"
  sudo mkdir -p "$BACKUP_DIR"
  sudo cp -a "$WEB_ROOT/." "$BACKUP_DIR/"
fi

# 5. 原子替换：先同步到临时目录，再整体替换
TMP_DIR="/tmp/whale-vault-deploy_$STAMP"
echo "🚚 正在同步构建产物到临时目录：$TMP_DIR"
sudo rm -rf "$TMP_DIR"
sudo mkdir -p "$TMP_DIR"
sudo cp -r "$DIST_DIR/." "$TMP_DIR/"

# 大文件 /downloads/：构建会把 public/downloads 同步进 dist；若未进 dist 则从源码树补拷
for _dl in GeoLite2-City.mmdb qqwry.dat foundry-nightly.tar.gz; do
  if [ -f "$TMP_DIR/downloads/$_dl" ]; then
    continue
  fi
  if [ -f "$SOURCE_DIR/public/downloads/$_dl" ]; then
    echo "📦 补充同步 $_dl 到站点 /downloads/（来自 public/downloads）"
    sudo mkdir -p "$TMP_DIR/downloads"
    sudo cp -f "$SOURCE_DIR/public/downloads/$_dl" "$TMP_DIR/downloads/"
  elif [ -f "$SOURCE_DIR/backend/$_dl" ]; then
    echo "📦 补充同步 $_dl 到站点 /downloads/（来自 backend）"
    sudo mkdir -p "$TMP_DIR/downloads"
    sudo cp -f "$SOURCE_DIR/backend/$_dl" "$TMP_DIR/downloads/"
  elif [ -f "$SOURCE_DIR/$_dl" ]; then
    echo "📦 补充同步 $_dl 到站点 /downloads/（来自项目根）"
    sudo mkdir -p "$TMP_DIR/downloads"
    sudo cp -f "$SOURCE_DIR/$_dl" "$TMP_DIR/downloads/"
  fi
done

# 可选：把 public/403.html 放到站点根（如果你想直接 /403.html 访问）
if [ "$COPY_403_HTML" = "true" ] && [ -f "$SOURCE_DIR/public/403.html" ]; then
  echo "📄 同步 public/403.html 到站点根（/403.html）"
  sudo cp -f "$SOURCE_DIR/public/403.html" "$TMP_DIR/403.html"
fi

echo "♻️ 正在替换线上目录内容..."
sudo rm -rf "$WEB_ROOT"/*
sudo cp -r "$TMP_DIR/." "$WEB_ROOT/"

# 6. 权限
echo "🔑 正在设置权限..."
sudo chown -R www-data:www-data "$WEB_ROOT"
sudo chmod -R 755 "$WEB_ROOT"

# 7. Nginx 校验与 reload
echo "⚙️ 校验 Nginx 配置并 reload..."
sudo nginx -t
sudo systemctl reload nginx

# 8. 基础自检（可选但建议）
echo "🧪 自检：确认 index.html 可访问"
curl -s -I "http://127.0.0.1/" | head -n 1 || true

echo "✅ 部署成功！"
echo "   - 线上目录：$WEB_ROOT"
echo "   - 备份目录：${BACKUP_DIR:-无}"
echo "🎉 部署闭环完成。"
# 以下复制若路径不存在会跳过，避免因权限/路径导致脚本报错
cp /root/faucethub/server/conflux-faucet-plugin.js /var/www/static/ 2>/dev/null || true
cp "$SOURCE_DIR/public/whale-vault-pitch-deck.mp4" "$WEB_ROOT/assets" 2>/dev/null || true
cp "$SOURCE_DIR/public/pitch-deck.html" "$WEB_ROOT/" 2>/dev/null || true