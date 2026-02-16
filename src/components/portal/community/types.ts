export type WeatherState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      lat: number;
      lon: number;
      tempC: number;
      code: number;
      isDay: boolean;
      fetchedAtISO: string;
    }
  | { status: "error"; message: string };

export type CommunityProfile = {
  fullName: string;
  company: string;
  role: string;
  avatarDataUrl: string | null;
  consentImagePolicy: boolean;
  birthdayISO: string;
};

export type CommunityMilestone = { line?: string };
