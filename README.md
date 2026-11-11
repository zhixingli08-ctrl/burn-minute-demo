# 烬账 ASHLEDGER（暂名）· BSC 分钟燃烧拍卖 · 前端演示

纯静态（index.html + style.css + app.js，字体走 Google Fonts），全部数据为浏览器内随机生成的演示数据。首页「看一局完整演示」用脚本化时间轴把第 1203 分钟从开局走到领奖（可开演 / 暂停 / 下一步 / 重来，1× 或 3×）。
不连钱包、不请求私钥/助记词、无合约、无交易。设计稿：/workspace/tianxin/proposals/2026-11-10-eden-bsc-DESIGN.md

发布（需要 GitHub 登录）：
  gh repo create zhixingli08-ctrl/burn-minute-demo --public --source=. --push
  git push origin main:gh-pages   # 然后在仓库 Settings → Pages 选 gh-pages 分支
