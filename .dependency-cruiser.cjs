/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // Rule 1: workflow-dsl must not import from workflow-engine, workflow-definition, or infra
    {
      name: 'workflow-dsl-no-upward-deps',
      severity: 'error',
      comment:
        'workflow-dsl is the foundational DSL layer — it must not depend on anything in this project',
      from: { path: '^src/workflow-dsl/' },
      to: {
        path: '^src/(workflow-engine|workflow-definition|infra)/',
        dependencyTypesNot: ['type-only'],
      },
    },

    // Rule 2: workflow-engine must not import from workflow-definition or infra
    {
      name: 'workflow-engine-no-upward-deps',
      severity: 'error',
      comment:
        'workflow-engine may only depend on workflow-dsl — not on workflow-definition or infra',
      from: { path: '^src/workflow-engine/' },
      to: {
        path: '^src/(workflow-definition|infra)/',
        dependencyTypesNot: ['type-only'],
      },
    },

    // Rule 3a: Module privacy — workflow-definition internals are private
    {
      name: 'workflow-definition-module-privacy',
      severity: 'error',
      comment:
        'External code must import from workflow-definition/index.ts — domain and infra internals are private',
      from: { pathNot: '^src/(workflow-definition/|shell\\.)' },
      to: { path: '^src/workflow-definition/(domain|infra)/' },
    },

    // Rule 3b: Module privacy — workflow-engine internals are private
    {
      name: 'workflow-engine-module-privacy',
      severity: 'error',
      comment:
        'External code must import from workflow-engine/index.ts — domain internals are private',
      from: { pathNot: '^src/workflow-engine/' },
      to: { path: '^src/workflow-engine/domain/' },
    },

    // Rule 4: workflow-definition domain must not import from workflow-analysis
    {
      name: 'workflow-definition-domain-isolation',
      severity: 'error',
      comment:
        'workflow-definition domain must not depend on workflow-analysis',
      from: { path: '^src/workflow-definition/domain/' },
      to: {
        path: '^src/workflow-analysis/',
        dependencyTypesNot: ['type-only'],
      },
    },

    // Rule 5: workflow-analysis must not import workflow-definition internals (only index.ts)
    {
      name: 'workflow-analysis-no-definition-internals',
      severity: 'error',
      comment:
        'workflow-analysis may import workflow-definition/index.ts and workflow-definition/infra/ (shared error types) — not domain internals',
      from: { path: '^src/workflow-analysis/' },
      to: { path: '^src/workflow-definition/domain/' },
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
