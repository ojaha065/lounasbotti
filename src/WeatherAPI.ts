import { Md } from "slack-block-builder";
import * as Utils from "./Utils.js";

// https://open-meteo.com/en/docs/

const getWeatherString = async (url: URL, daysForward = 0): Promise<string | null> => {
	try {
		const response = await Utils.fetchWithTimeout(
			url,
			{
				method: "GET",
				headers: {
					Accept: "application/json"
				}
			}
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const json = (await response.json()) as any;
		const arrIndex = 12 + (24 * daysForward);

		const emoji = weatherCodeToEmoji((json.hourly?.weather_code ?? [])[arrIndex]);
		const temperature = (json.hourly?.temperature_2m ?? [])[arrIndex] ?? null;
		const temperatureUnit = json.hourly_units?.temperature_2m ?? "";
		return `${emoji ?? ""} ${temperature !== null ? Math.round(Number(temperature)) : ""} ${temperatureUnit && temperature !== null ? temperatureUnit : ""}`;
	} catch (error) {
		console.error(error);
		return null;
	}
};

const printAllEmoji = (): string => {
	return ["sun_with_face", "sun_small_cloud", "partly_sunny", "cloud", "fog", "partly_sunny_rain", "rain_cloud", "snow_cloud", "snowflake", "umbrella_with_rain_drops", "lightning_cloud"]
		.map(Md.emoji)
		.join("");
};

const weatherCodeToEmoji = (weatherCode: number | undefined): string | null => {
	switch(weatherCode) {
		case 0: // Clear sky
			return Md.emoji("sun_with_face");
		case 1: // Mainly clear
			return Md.emoji("sun_small_cloud");
		case 2: // Partly cloudy
			return Md.emoji("partly_sunny");
		case 3: // Overcast
		case 51: // Light drizzle
			return Md.emoji("cloud");
		case 45: // Fog
		case 48: // Depositing rime fog
			return Md.emoji("fog");
		case 80: // Slight rain showers
			return Md.emoji("partly_sunny_rain");
		case 53: // Moderate drizzle
		case 55: // Dense drizzle
		case 56: // Light freezing drizzle
		case 57: // Dense freezing drizzle
		case 61: // Slight rain
		case 66: // Light freezing rain
			return Md.emoji("rain_cloud");
		case 71: // Slight snow fall
		case 73: // Moderate snow fall
		case 77: // Snow grains
		case 85: // Slight show showers
		case 86: // Heavy snow showers
			return Md.emoji("snow_cloud");
		case 75: // Heavy snow fall
			return Md.emoji("snowflake");
		case 63: // Moderate rain
		case 65: // Heavy rain
		case 67: // Heavy freezing rain
		case 81: // Moderate rain showers
			return Md.emoji("umbrella_with_rain_drops");
		case 82: // Violent rain showers
		case 95: // Slight or moderate thunderstorm
		case 96: // Thunderstorm with slight hail
		case 99: // Thunderstorm with heavy hail
			return Md.emoji("lightning_cloud");
		default:
			console.warn(`Unrecognized weatherCode ${weatherCode}`);
			return null;
	}
};

export {getWeatherString, printAllEmoji};