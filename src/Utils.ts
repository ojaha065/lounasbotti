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

export { splitByBrTag, getCurrentWeekdayNameInFinnish, capitalizeString};