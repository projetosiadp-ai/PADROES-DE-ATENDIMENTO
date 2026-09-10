const KIB = 1024;

module.exports = {
  ci: {
    collect: {
      staticDistDir: './',
      numberOfRuns: 3,
      settings: {
        onlyCategories: ['performance'],
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 360,
          height: 800,
          deviceScaleFactor: 2,
          disabled: false,
        },
      },
    },
    assert: {
      includePassedAssertions: true,
      assertions: {
        'resource-summary:script:size': ['error', { maxNumericValue: 256 * KIB }],
        'resource-summary:total:size': ['error', { maxNumericValue: 512 * KIB }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
};
