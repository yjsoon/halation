#!/bin/zsh
# ui.sh <udid> : labelled accessibility elements with frames [x, y, width, height] in points
axe describe-ui --udid "$1" | python3 -c "
import json,sys
def walk(n,d=0):
    if isinstance(n,list):
        [walk(x,d) for x in n]; return
    l=n.get('AXLabel') or ''; t=n.get('type') or n.get('role'); f=n.get('frame',{}); u=n.get('AXUniqueId') or ''; v=n.get('AXValue') or ''
    if l or u or v: print('  '*min(d,6), t, repr(l), u, repr(v) if v else '', [round(f.get(k,0)) for k in ('x','y','width','height')])
    [walk(c,d+1) for c in n.get('children',[])]
walk(json.load(sys.stdin))"
