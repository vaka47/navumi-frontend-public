export type Profile = {
    id: number;
    username: string;
    role: "client" | "club";
    profile_picture?: string | null;
};

export type ClubProfile = {
    role: "club";
    username: string;
    club_name: string;
    telegram_username?: string;
    instagram_username?: string;
    phone_number?: string;
    website?: string;
    description?: string;
    profile_picture?: string;
};

export type ClientProfile = {
    role: "client";
    username: string;
    full_name: string;
    telegram_username?: string;
    instagram_username?: string;
    phone_number?: string;
    website?: string;
    description?: string;
    profile_picture?: string;
};

export type ProfileData = ClubProfile | ClientProfile;
