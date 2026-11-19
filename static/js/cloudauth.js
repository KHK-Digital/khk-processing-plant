
'use strict';

// KHK Processing Plant - DEV Cloud Configuration

const KHK_CLOUD_CONFIG = Object.freeze({
  environment: 'dev',

  awsRegion: 'ap-southeast-1',

  cognito: {
    domain:
      'https://ap-southeast-1wj6bnyioq.auth.ap-southeast-1.amazoncognito.com',

    clientId:
      '2jpdu7lt38q8sb6rndu3n6qa5j',

    issuer:
      'https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_WJ6BNyIOQ',

    scopes: ['openid', 'email']
  },

  api: {
    baseUrl:
      'https://xetf74dlzb.execute-api.ap-southeast-1.amazonaws.com/dev',

    weighingSyncPath: '/api/weighings/sync'
  }
});

window.KHK_CLOUD_CONFIG = KHK_CLOUD_CONFIG;

console.log(
  'KHK Cloud configuration loaded:',
  KHK_CLOUD_CONFIG.environment
);
