export default function PollingToggle({ checked, onChange }) {
    return (
        <div className="bg-white border border-brand/30 rounded-lg shadow-sm p-4">
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    className="w-4 h-4 accent-brand"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <i className="fas fa-location-pin text-brand" />
                <span className="text-sm font-medium text-gray-800">Show Polling Stations</span>
            </label>
        </div>
    );
}
