'use strict';
// SSO 登录配置（编译进应用，终端用户无需在界面里配置）。
// 发布前在这里填好 Auth0 的域名和 Client ID 即可。
// 留空 issuer/clientId 时，启动登录门不会生效（便于开发调试）。
module.exports = {
  enabled: true,
  issuer: '', // 例：https://dev-xxxx.us.auth0.com（你的 Auth0 租户域名）
  clientId: '', // Auth0 应用的 Client ID
  redirectUri: 'http://127.0.0.1:18317/callback', // 必须与 Auth0 控制台登记的 Callback URL 一致
  scopes: 'openid profile email',
};
