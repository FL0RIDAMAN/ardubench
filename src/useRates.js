// Ask the FC to stream some messages while a screen is open, e.g.
// useRates(v, { [MSG_ID.ATTITUDE]: 10 }). ArduCopter sends most messages only
// when asked (its SRn_ stream rates default to 0), and forgets the request
// when it reboots, so this asks again after a reboot. When the screen closes
// each message goes back to the FC's own rate (interval 0 = default).
import { useEffect } from 'react';

export function useRates(v, rates) {
  const key = JSON.stringify(rates);
  const ready = v.connected && !v.rebooting;
  useEffect(() => {
    if (!ready) return undefined;
    const ids = Object.keys(rates).map(Number);
    ids.forEach((id) => v.setRate(id, rates[id]));
    return () => { if (v.connected) ids.forEach((id) => v.setRate(id, 0)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, key, ready]);
}
