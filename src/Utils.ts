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
 * Removes all non-inherited fields from any object
 * @param obj Object to clear
 */
const clearObject = <T extends object>(obj: T): void => {
	for (const key in obj) {
		// eslint-disable-next-line no-prototype-builtins
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
 * Retries once if a network error is encountered
 * See {@link Fetch} for documentation
 */
const fetchWithTimeout = (url: string | URL, init: RequestInit = {}, allowRetry = true): Promise<Response> => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 8000);

	return fetch(url, {...init, signal: controller.signal}).catch((error: any) => {
		console.error(error);
		if (allowRetry) {
			return new Promise(resolve => { setTimeout(resolve, 2000); }).then(() => fetchWithTimeout(url, init, false));
		}

		throw error;
	}).finally(clearTimeout.bind(null, timeout));
};

/**
 * Decodes Base64 input
 * @param input Base64 encoded input string
 * @returns Decoded string
 */
const decodeBase64 = (input: string) => {
	return Buffer.from(input, "base64").toString("ascii");
};

export { splitByBrTag, getCurrentWeekdayNameInFinnish, capitalizeString, clearObject, requireNonNullOrUndefined, fetchWithTimeout, decodeBase64 };