import { useEffect, useState } from 'react';

/** Returns `value` after it has been stable for `ms` milliseconds. */
export default function useDebounce(value, ms = 300) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setV(value), ms);
        return () => clearTimeout(id);
    }, [value, ms]);
    return v;
}
