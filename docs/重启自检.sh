#!/usr/bin/env bash
# 重启后运行：确认「自动签到开关」在重启后仍然生效。
#
# 判定依据不是面板文字，而是三件事同时成立：
#   1. state.json 里 enabled 仍为 true（配置没被重置）
#   2. overview 返回的 scheduler.armed 为 true（定时器真的装上了）
#   3. scheduler.nextAt 是未来时间（下一次执行点已排好）
set -uo pipefail

STATE="${DSH_HOME:-$HOME/.dsh}/dsh-connect-two/state.json"
URL="http://127.0.0.1:3080/plugins/dsh-connect-two/overview"

echo "== 1. 磁盘状态 =="
if [[ ! -f "$STATE" ]]; then
  echo "FAIL: 状态文件不存在：$STATE"
  exit 1
fi
python3 - "$STATE" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
a=d.get('config',{}).get('autoCheckin',{})
print('  enabled =',a.get('enabled'),'| time =',a.get('time'),'| catchUp =',a.get('catchUp'))
sys.exit(0 if a.get('enabled') is True else 3)
PY
if [[ $? -eq 3 ]]; then
  echo "FAIL: 磁盘上 enabled 不是 true —— 开关在重启时被重置了"
  exit 1
fi

echo "== 2. 运行时调度器 =="
BODY="$(curl -s -m 20 "$URL")" || { echo "FAIL: 路由不可达"; exit 1; }
echo "$BODY" | python3 -c '
import json,sys,time
d=json.load(sys.stdin)
s=d.get("scheduler") or {}
print("  scheduler =",json.dumps(s,ensure_ascii=False))
if "stateError" in d:
    print("  FAIL: 状态文件损坏：",d["stateError"]); sys.exit(4)
if not s.get("armed"):
    print("  FAIL: enabled 为真但定时器没有装载（armed=false）"); sys.exit(5)
n=s.get("nextAt") or 0
if n <= time.time()*1000:
    print("  FAIL: nextAt 不在未来"); sys.exit(6)
print("  OK: 定时器已装载，下一次执行：",time.strftime("%Y-%m-%d %H:%M",time.localtime(n/1000)))
'
code=$?
if [[ $code -ne 0 ]]; then exit 1; fi

echo
echo "PASS: 重启后自动签到开关仍然有效。"
