const BR_EXP = /<br\s*\/?>/i;

/**
 * Splits string by <br /> HTML tag
 * @param input The input string
 * @returns {string[]}
 */
const splitByBrTag = (input: string): string[] => {
	return input.split(BR_EXP);
};

export { splitByBrTag };