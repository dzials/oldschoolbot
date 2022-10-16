module.exports = {
	coverageProvider: 'v8',
	displayName: 'unit test',
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['<rootDir>/tests/**/*.test.ts'],

		transform: {
		  // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    '^.+\\.tsx?$': [
      'ts-jest',
      {
       tsconfig: '<rootDir>/tests/tsconfig.json'
      },
    ],
	},
	setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
	collectCoverageFrom: [
		"./src/lib/structures/Gear.ts",
		"./src/lib/util/parseStringBank.ts",
		"./src/lib/util/buyLimit.ts",
		"./src/lib/util/equipMulti.ts",
		"./src/mahoji/commands/fish.ts"
	],
	coverageThreshold: {
    	global: {
			branches: 90,
			functions: 90,
			lines: 90,
			statements: 90,
   		},
 	},
};
