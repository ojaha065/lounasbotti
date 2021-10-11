type Settings = {
	dataProvider: "ruokapaikkaFi",
	userAgent: string,
	defaultRestaurants: Restaurant[],
	gitUrl: string,
	displayVoters: boolean
}

enum Restaurant {
	savo = "savo",
	talli = "talli",
	rami = "rami",
	august = "august",
	holvi = "holvi"
}

const RestaurantNameMap: Record<Restaurant, String> = {
	savo: "Ravintola Savo",
	talli: "Ravintola Talli",
	rami: "Lounasravintola Rami",
	august: "Ravintola August",
	holvi: "Bistro Holvi"

};

export { Settings, Restaurant, RestaurantNameMap };