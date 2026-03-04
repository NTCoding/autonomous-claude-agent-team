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
        'External code must import from workflow-definition/index.ts — domain internals (registry, states, operations) are private',
      from: { pathNot: '^src/workflow-definition/' },
      to: { path: '^src/workflow-definition/domain/' },
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

    // Rule 4: workflow-definition must not import from infra
    {
      name: 'workflow-definition-no-upward-deps',
      severity: 'error',
      comment:
        'workflow-definition may depend on workflow-dsl and workflow-engine — not on infra',
      from: { path: '^src/workflow-definition/' },
      to: {
        path: '^src/infra/',
        dependencyTypesNot: ['type-only'],
      },
    },

    // Rule 5: Entrypoint allowed imports — only workflow-definition/, workflow-engine/, and infra/
    {
      name: 'entrypoint-allowed-imports',
      severity: 'error',
      comment:
        'Entrypoint must import from workflow-definition/, workflow-engine/, or infra/ — never from internal domain/ paths or other modules directly',
      from: { path: '^src/autonomous-claude-agent-team-workflow\\.ts$' },
      to: {
        path: '^src/(?!workflow-definition/|workflow-engine/|infra/)',
        pathNot: '^src/autonomous-claude-agent-team-workflow\\.ts$',
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
