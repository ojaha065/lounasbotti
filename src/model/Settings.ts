type Settings = {
	dataProvider: "ruokapaikkaFi",
	userAgent: string,
	defaultRestaurants: Restaurant[],
	gitUrl: string
}

enum Restaurant {
	savo = "savo",
	talli = "talli",
	rami = "rami",
	august = "august"
}

const RestaurantNameMap: Record<Restaurant, String> = {
	savo: "Ravintola Savo",
	talli: "Ravintola Talli",
	rami: "Lounasravintola Rami",
	august: "Ravintola August"

};

export { Settings, Restaurant, RestaurantNameMap };