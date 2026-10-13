# iPhone 安装与迁移

[应用](https://floki-u.github.io/Yujournal/) · [安装页](https://floki-u.github.io/Yujournal/install.html) · [描述文件](https://floki-u.github.io/Yujournal/Yujournal.mobileconfig)。无需 App Store 或开发者账号。

## Safari 添加到主屏幕

1. 在 iPhone Safari 打开应用地址。
2. 点“分享”，选择“添加到主屏幕”。如菜单未显示，向下找到或编辑操作。
3. 如出现“打开为网页 App”，保持开启，点“添加”。
4. 从主屏幕“余记”图标打开，首次联网完成缓存后再开始正式记账。

这个方式无需描述文件。菜单会随 iOS/Safari 版本变化，见 [Apple 操作说明](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios)。

## Web Clip 描述文件

1. Safari 打开 [Yujournal.mobileconfig](https://floki-u.github.io/Yujournal/Yujournal.mobileconfig)，选“允许”；也可从 [Releases](https://github.com/floki-u/Yujournal/releases) 下载。
2. 打开“设置 → 已下载描述文件”；也可去“通用 → VPN 与设备管理”查找。
3. 点“安装”，在手机输入锁屏密码，核对内容并完成安装。
4. 从主屏幕“余记”打开，完成首次程序缓存。

如果只下载到了“文件”，在那里打开 `.mobileconfig` 再去设置安装。iOS 可能提示“未签名”：项目使用无需签名/续期的普通 Web Clip，内容可以在仓库检查。根据 [Apple 安装说明](https://support.apple.com/en-us/102400)，下载后未安装的描述文件会在 8 分钟后自动删除，需重新下载。

文件**只含一个可移除的全屏网页图标**，没有 MDM、VPN、证书、设备限制或账本，不需要开发者模式。若系统安全设置阻止安装，使用 Safari 方式即可，不要为了网页图标削弱设备保护。

电脑 USB 连接可用 Apple CoreDevice 打开手机 Safari 的下载链接，下载许可、安装许可和密码仍由你在手机确认。这个应用不通过 `.ipa` 或 Xcode 签名安装。

## 离线与迁移

首次联网打开，等待“离线账本已准备”。如需离线 OCR，到“我的 → 本机储存与离线识别 → 准备离线识别”，等待约 7.5 MiB 资源准备完成。飞行模式测试重开、记账、读取、导出；未缓存的主题、识别包或首次汇率仍需网络。

换机、换入口、换网址或卸载前，导出 `.yuji` 并检查文件。新入口导入时先看预览，再合并或恢复。Safari、主屏幕与不同网址的数据分区由系统管理，不承诺自动共享数据库。旧私人预览网址与 GitHub Pages 是不同 origin，历史需要通过备份迁移。

## 检查文件

```sh
plutil -lint install/Yujournal.mobileconfig
plutil -p install/Yujournal.mobileconfig
```

应只有一个 `com.apple.webClip.managed`，`FullScreen` / `IsRemovable` 为 true，URL 为目标 HTTPS 地址。
