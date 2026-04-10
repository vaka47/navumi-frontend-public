'use client';

import { createContext, useContext } from 'react';

export const ProfileContext = createContext<{ username: string } | null>(null);

export const useProfile = () => {
    const context = useContext(ProfileContext);
    if (!context) throw new Error("useProfile must be used within ProfileProvider");
    return context;
};
