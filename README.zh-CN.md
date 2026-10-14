# Yujournal · 余记

**每天记一点，账目留在本机。**

[打开应用](https://floki-u.github.io/Yujournal/) · [iPhone 安装入口](https://floki-u.github.io/Yujournal/install.html) · [描述文件](https://floki-u.github.io/Yujournal/Yujournal.mobileconfig) · [版本下载](https://github.com/floki-u/Yujournal/releases) · [English](README.md)

适配 iPhone 的记账 PWA，安装后从主屏幕独立打开。无需上架 App Store、付费苹果开发者账号或定期重新签名。GitHub Pages 版本公开可访问，不要求 ChatGPT 登录。

**v0.2.3 为早期版本**。已通过自动化测试和部分桌面浏览器验证；真机状态公开记录在 [测试说明](docs/TESTING.md)，不会将未验证项目标为通过。

安装、自动更新、语音包续传与删除缓存的问题，见 [常见问题](docs/FAQ.zh-CN.md)。

## 功能

- 应用内长按语音、多笔收支一次核对入账，也保留键盘听写；付款截图可裁剪识别，查看原图并修改金额。
- 首页展示所选当天收支；账本和报告支持日、月、年与日历，资产有独立页面。
- 一个期初资产总额，默认从 0 开始；存钱计划支持留存、取回、归档与恢复，不重复扣减资产。
- 周、月、年固定收支，每个模板选择自动入账或待确认；打开时补记，重复打开不重复入账。
- 8 个币种、自动日参考汇率与冻结折算；12 枚徽章、佩戴、永久解锁主题，以及 PNG 摘要/明细报告。

默认主题支持系统、深色、浅色；薄荷小岛、风物来信、月海玻璃、像素冒险各有场景、角色、图标、字体与短动效，尊重“减少动态效果”。

## 安装

推荐在 Safari 打开 [应用](https://floki-u.github.io/Yujournal/)，选择 **分享 → 添加到主屏幕 → 打开为网页 App → 添加**，随后从主屏幕图标开始正式记账。

也可下载 [Yujournal.mobileconfig](https://floki-u.github.io/Yujournal/Yujournal.mobileconfig)，点“允许”，再去 **设置 → 已下载描述文件 → 安装**。这个未签名、可移除文件只添加全屏网页图标，不含 MDM、VPN、证书、设备限制或账本。安装确认和密码由你在手机完成，见 [安装指南](docs/INSTALL.zh-CN.md)。

“我的”支持编辑名称和本机头像，随完整备份迁移。截图可从系统分享菜单运行已签名的 [快捷指令](docs/SHORTCUTS.zh-CN.md)，无需重输金额；最终回到余记确认。保存报告优先打开系统分享面板，在那里点“存储图像”。

本机语音包约 **98 MiB**，首次按需准备，录音不上传、不保存。首次麦克风授权后可能需要再次按住说话；识别错误仍要核对。

首次联网完成缓存后可离线记账；离线截图识别需先准备约 7.5 MiB 本机模型。

## 数据与备份

收支、备注、图片、计划、密码和备份不上传；没有业务账号、统计 SDK 或云端账本。静态托管提供程序/资源，汇率服务只接收币种和报价日期，系统听写按 iOS 设置工作。

`.yuji` 完整文件可迁移收支、截图、期初、计划、模板、徽章和主题。导入先校验、预览，再合并或恢复；完整恢复前生成当前账本的安全备份。可选密码在本机加密，不能找回。

**定期导出，并确认文件确实保存在你保管的位置。** 浏览器可能清理网站数据。图标和描述文件不能代替备份；换机、换入口或换网址前先备份。

## 开发

Node.js 24+；生产运行只有静态文件，不需要业务服务器或 API 密钥。

```sh
git clone https://github.com/floki-u/Yujournal.git
cd Yujournal
npm ci
npm test
npm run check
npm run build
npm run dev
```

本机打开 `http://127.0.0.1:4313/`。部署自己的地址：

```sh
YUJOURNAL_APP_URL=https://example.com/ledger/ npm run build
```

上传 `dist/`，描述文件会指向这个地址，见 [部署](docs/DEPLOYMENT.md) 和 [架构](docs/ARCHITECTURE.md)。

PWA 无法直接读取其他支付 App 的流水，也没有后台常驻定时器和自动刷新余额的原生 WidgetKit 小组件，可用快捷指令做录入入口。参考汇率通常按日更新，银行卡实际人民币结算可覆盖它。

代码和自有素材采用 [MIT](LICENSE)，OCR/字体采用各自许可，见 [第三方声明](THIRD_PARTY_NOTICES.md)。贡献见 [CONTRIBUTING.md](CONTRIBUTING.md)；反馈请使用虚构数据。
