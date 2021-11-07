import { deserialize, serialize } from "v8";

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
const getCurrentWeekdayNameInFinnish = (): string => {
	return new Date().toLocaleDateString("fi-FI", {
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

export { splitByBrTag, getCurrentWeekdayNameInFinnish, capitalizeString, deepClone, clearObject };