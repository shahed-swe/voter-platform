import { useState } from 'react';

/**
 * Password input with a show/hide toggle — used everywhere a password is
 * typed (user creation, password reset). Forwards all input props.
 */
export default function PasswordInput({ className = '', ...props }) {
    const [show, setShow] = useState(false);
    return (
        <div className="relative">
            <input
                {...props}
                type={show ? 'text' : 'password'}
                className={`${className} pr-10`}
            />
            <button
                type="button"
                tabIndex={-1}
                className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-gray-600"
                onClick={() => setShow((s) => !s)}
                title={show ? 'Password লুকান' : 'Password দেখুন'}
                aria-label={show ? 'Hide password' : 'Show password'}
            >
                <i className={`fas ${show ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
        </div>
    );
}
