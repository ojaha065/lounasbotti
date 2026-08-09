import globals from "globals";

import { defineConfig } from "eslint/config";

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import json from "@eslint/json";
import eslintPluginYml from 'eslint-plugin-yml';

export default defineConfig([
	// Global settings for all files types
	// Important: Do NOT add any files, rules or "extends" here
	{
		name: "Lounasbotti/eslint-config",
		languageOptions: {
			globals: {
				...globals.node
			}
		},
		linterOptions: {
			reportUnusedInlineConfigs: "warn"
		}
	},

	// Global ignores
	// When ignores is used without any other keys (besides name) in the configuration object,
	// then the patterns act as global ignores.
	// This means they apply to every configuration object
	// (not only to the configuration object in which it is defined).
	{
		name: "Lounasbotti/eslint-config/ignores",
		ignores: [
			"node_modules/",
			"dist/"
		]
	},

	// JavaScript
	{
		name: "Lounasbotti/eslint-config/js",
		files: ["**/*.{js,mjs,ts}"],
		extends: [eslint.configs.recommended]
	},

	// TypeScript
	// https://typescript-eslint.io/
	// Combines with JavaScript rules above
	{
		name: "Lounasbotti/eslint-config/ts",
		files: ["**/*.ts"],
		extends: [tseslint.configs.recommended]
	},

	// JSON
	// https://github.com/eslint/json
	{
		name: "Lounasbotti/eslint-config/json",
		files: ["**/*.json"],
		ignores: ["package-lock.json"],
		extends: [json.configs.recommended],
		language: "json/json"
	},

	// YAML
	// https://ota-meshi.github.io/eslint-plugin-yml/
	{
		name: "Lounasbotti/eslint-config/yaml",
		files: ["**/*.yml"],
		extends: [eslintPluginYml.configs.standard],
		language: "yml/yaml",
		rules: {
			"yml/plain-scalar": "off",
			"yml/no-empty-mapping-value": "off"
		}
	}
]);