import * as cheerio from "cheerio";

import { Restaurant, Settings } from "./Settings.js";

interface LounasDataProvider {
    readonly id: string;

    /**
     * Should include the protocol and trailing slash
     * e.g. "https://www.lorem.com/"
     */
    readonly baseUrl: string;

    readonly settings: Settings;
    readonly restaurantMap: Record<Restaurant, string>

    getData: (restaurants: Restaurant[]) => Promise<LounasResponse[]>;

    /**
     * Handles any quirks that this data source might have
     * @returns {string} String ready to be used
     */
    parseLounasHTML: ($: cheerio.Cheerio<cheerio.Element>) => string[];
}

type LounasResponse = {
    restaurant: Restaurant,
    date?: string
    items?: string[]
    error?: Error
}

export { LounasDataProvider, LounasResponse };