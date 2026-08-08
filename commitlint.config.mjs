export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
    'scope-enum': [
      1,
      'always',
      [
        'api',
        'auth',
        'users',
        'db',
        'queue',
        'cache',
        'config',
        'health',
        'metrics',
        'openapi',
        'deps',
        'ci',
        'docker',
        'release',
        'test',
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 120],
  },
};
