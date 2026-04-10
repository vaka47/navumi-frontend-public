import { H } from '@highlight-run/next/client'
import { useEffect } from 'react'
import { User } from '@/store/userStore'

interface IdentifyUserProps {
    user: User
}

export function IdentifyUser({ user }: IdentifyUserProps) {
    useEffect(() => {
        try {
            const email = typeof user.email === 'string' ? user.email.trim() : ''
            const id = typeof user.id === 'string' ? user.id.trim() : ''
            const identifier = email || id
            if (!identifier) return // не дёргаем Highlight, если идентификатор пустой
            H.identify(identifier, {
                id,
                role: user.role,
                telegram: user.telegram_username,
                instagram: user.instagram_username,
            })
        } catch { /* noop */ }
    }, [user])

    return null
}
