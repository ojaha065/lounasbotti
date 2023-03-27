import { deserialize, serialize } from "v8";
import fetch, { RequestInfo, RequestInit, Response } from "node-fetch";

const BR_EXP = /<br\s*\/?>/i;

/**
 * Splits string by <br /> HTML tag
 * @param input The input string
 * @returns {string[]}
 */
const splitByBrTag = (input: string): string[] => {
	return input.split(BR_EXP);
};

/**
 * @returns {string}
 */
const getCurrentWeekdayNameInFinnish = (tomorrow = false): string => {
	const now = new Date();
	if (tomorrow) {
		now.setDate(now.getDate() + 1);
	}

	return now.toLocaleDateString("fi-FI", {
		weekday: "long"
	}).toLowerCase();
};

/**
 * Changes the first character of a string to uppercase
 * @param string 
 * @returns {string}
 */
const capitalizeString = (string: string): string => {
	return string.charAt(0).toUpperCase() + string.slice(1);
};

/**
 * Deep clones any object using V8 structuredClone
 * @param obj Object to clone
 * @returns Cloned object
 * @experimental
 */
const deepClone = <T extends object>(obj: T): T => {
	return deserialize(serialize(obj));
};

/**
 * Removes all non-inherited fields from any object
 * @param obj Object to clear
 */
const clearObject = <T extends Object>(obj: T): void => {
	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			delete obj[key];
		}
	}
};

/**
 * Returns the passed parameter as is, unless it's missing, in which case throws
 * @returns The passed value
 * @throws When the value is missing
 */
const requireNonNullOrUndefined = <T>(value: T, message?: string): T => {
	if (value === undefined || value === null) {
		throw new Error(message || "Required value missing");
	}

	return value;
};

/**
 * Fetch with a sensible timeout
 * See {@link Fetch} for documentation
 */
const fetchWithTimeout = async (url: RequestInfo, init: RequestInit = {}): Promise<Response> => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 8000);

	const response = await fetch(url, {...init, signal: controller.signal as any}); // FIXME: Conflict between internal TypeScript typings and typings from node-fetch
	clearTimeout(timeout);

	return response;
};

/**
 * Decodes Base64 input
 * @param input Base64 encoded input string
 * @returns Decoded string
 */
const decodeBase64 = (input: string) => {
	return Buffer.from(input, "base64").toString("ascii");
};

export { splitByBrTag, getCurrentWeekdayNameInFinnish, capitalizeString, deepClone, clearObject, requireNonNullOrUndefined, fetchWithTimeout, decodeBase64 };