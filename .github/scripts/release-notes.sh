#!/usr/bin/env bash
# 生成 GitHub Release 说明：tag 注释作为概要，其后是按 commit 类型分组的变更和镜像用法。
# 用法：release-notes.sh <tag> <owner/repo> [image]
set -euo pipefail

tag="$1"
repo="$2"
image="${3:-ghcr.io/$repo}"
version="${tag#v}"
previous="$(git describe --tags --abbrev=0 "$tag^" 2>/dev/null || true)"
range="${previous:+$previous..}$tag"

# 附注 tag 的说明（轻量 tag 没有，跳过）
if [ "$(git cat-file -t "$tag")" = "tag" ]; then
  summary="$(git tag -l --format='%(contents:body)' "$tag" | sed -e '/-----BEGIN PGP SIGNATURE-----/,$d')"
  subject="$(git tag -l --format='%(contents:subject)' "$tag")"
  if [ -n "$subject" ] && [ "$subject" != "$tag" ]; then
    printf '%s\n\n' "$subject"
  fi
  if [ -n "$summary" ]; then
    printf '%s\n\n' "$summary"
  fi
fi

# section <标题> <grep 参数...>：按提交标题筛选并输出一组
section() {
  local title="$1" lines
  shift
  lines="$(git log --no-merges --format='%s%x09%h%x09%H' "$range" \
    | grep "$@" || true)"
  [ -z "$lines" ] && return 0
  printf '### %s\n\n' "$title"
  while IFS=$'\t' read -r message short full; do
    # 去掉 "type(scope): " 前缀，首字母保持原样
    message="$(printf '%s' "$message" | sed -E 's/^[a-z]+(\([^)]*\))?!?: //')"
    printf -- '- %s ([%s](https://github.com/%s/commit/%s))\n' "$message" "$short" "$repo" "$full"
  done <<< "$lines"
  printf '\n'
}

known='^(feat|fix|design|style|perf|docs)(\([^)]*\))?!?: '
echo "## 变更"
echo
section "新功能" -E '^feat(\([^)]*\))?!?: '
section "问题修复" -E '^fix(\([^)]*\))?!?: '
section "界面" -E '^(design|style)(\([^)]*\))?!?: '
section "性能" -E '^perf(\([^)]*\))?!?: '
section "文档" -E '^docs(\([^)]*\))?!?: '
# 其余类型（refactor、chore、ci 等）以及未按约定书写的提交
section "其他" -Ev "$known"

cat <<NOTES
## Docker

\`\`\`bash
docker run -d --name ipinfo -p 3000:3000 \\
  -v "\$(pwd)/data:/app/lib/data" \\
  --restart unless-stopped \\
  $image:$version
\`\`\`

镜像标签：\`$version\`、\`${version%.*}\`、\`${version%%.*}\`、\`latest\`（linux/amd64）。GeoIP 数据库不在镜像内，首次启动时下载到挂载的 \`data\` 目录。

NOTES

if [ -n "$previous" ]; then
  echo "**完整变更**：https://github.com/$repo/compare/$previous...$tag"
else
  echo "**完整变更**：https://github.com/$repo/commits/$tag"
fi
