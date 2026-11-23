import js from '@eslint/js';
import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      'api/**/*',
      'components/**/*',
      'service-worker.js',
      'DRAFT_firestore.rules',
      'src/**/*',
      'firestore.rules.test.ts',
    ],
  },
  js.configs.recommended,
  firebaseRulesPlugin.configs['flat/recommended'],
];
