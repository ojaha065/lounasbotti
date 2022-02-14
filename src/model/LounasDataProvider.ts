import { Restaurant, Settings } from "./Settings.js";

interface LounasDataProvider {
    readonly id: string;

    /**
     * Should include the protocol and trailing slash
     * e.g. "https://www.lorem.com/"
     */
    readonly baseUrl: string;

    readonly settings: Settings;
    readonly restaurantMap?: Record<Restaurant, string | LounasDataProvider>

    getData: (restaurants: Restaurant[], additionalRestaurants?: Restaurant[], tomorrowRequest?: boolean) => Promise<LounasResponse[]>;
}

interface LounasResponseBasic {
    restaurant: Restaurant,
    isAdditional: boolean,
    date?: string,
    iconUrl?: string | undefined
}

interface LounasResponseSuccess extends LounasResponseBasic {
    items: string[],
    error?: never
}

interface LounasResponseFailure extends LounasResponseBasic {
    items?: never,
    error: Error
}

type LounasResponse = LounasResponseSuccess | LounasResponseFailure;

export { LounasDataProvider, LounasResponse };