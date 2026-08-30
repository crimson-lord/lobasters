import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  { ignores: ['.next/**', 'node_modules/**'] },
  ...nextVitals,
  {
    rules: {
      // These rules are useful signals, but this mature client-heavy app uses
      // browser storage and ref-backed WebMCP handlers that intentionally
      // update state after hydration. Keep them visible without blocking CI.
      'react/no-unescaped-entities': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
];

export default config;
