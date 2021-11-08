type Settings = {
	dataProvider: "ruokapaikkaFi" | "mock",
	userAgent: string,
	defaultRestaurants: Restaurant[],
	gitUrl: string,
	displayVoters: boolean,
	emojiRules?: Map<RegExp, string>
	debug?: {
		noDb?: boolean
	}
}

enum Restaurant {
	savo = "savo",
	talli = "talli",
	rami = "rami",
	august = "august",
	holvi = "holvi"
}

const RestaurantNameMap: Record<Restaurant, string> = {
	savo: "Ravintola Savo",
	talli: "Ravintola Talli",
	rami: "Lounasravintola Rami",
	august: "Ravintola August",
	holvi: "Bistro Holvi"

};

export { Settings, Restaurant, RestaurantNameMap };