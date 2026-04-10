export {};

declare global {
    interface Window {
        __openProfileEdit?: () => void;
    }
}
