import { create } from 'zustand'

export interface User {
    id: string
    email: string
    role: 'client' | 'club'
    telegram_username?: string
    instagram_username?: string
}

interface UserStore {
    user: User | null
    setUser: (user: User) => void
    clearUser: () => void
}

export const useUserStore = create<UserStore>((set) => ({
    user: null,
    setUser: (user: User) => set({ user }),
    clearUser: () => set({ user: null }),
}))
