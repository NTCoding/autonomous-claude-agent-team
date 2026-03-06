/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'analytics-no-workflow-definition',
      severity: 'error',
      comment:
        'workflow-control-center is a generic analytics package — it must never depend on workflow-definition',
      from: { path: '^src/' },
      to: {
        path: 'workflow-definition',
      },
    },
  ],

  options: {
    doNotFollow: {
      path: 'node_modules',
      dependencyTypes: [
        'npm',
        'npm-dev',
        'npm-optional',
        'npm-peer',
        'npm-bundled',
        'npm-no-pkg',
      ],
    },

    tsConfig: {
      fileName: 'tsconfig.json',
    },

    externalModuleResolutionStrategy: 'node_modules',

    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
}
