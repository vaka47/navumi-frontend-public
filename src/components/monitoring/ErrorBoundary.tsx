'use client';

import { H } from '@highlight-run/next/client';
import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: unknown): void {
        // Сохраняем ошибку в Highlight
        if (error instanceof Error) {
            H.consumeError(error);
        } else {
            H.consumeError(new Error('Unknown error type'));
        }
    }

    render() {
        if (this.state.hasError) {
            return <h1>Что-то пошло не так.</h1>;
        }
        return this.props.children;
    }

}
