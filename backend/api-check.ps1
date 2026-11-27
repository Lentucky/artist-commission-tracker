param([string]$base = 'http://localhost:8080/api', [string]$origin = '', [string]$extOrigin = '')
$fail = 0

function Call($method, $path, $token, $body) {
    $p = @{ Method = $method; Uri = "$base$path"; ContentType = 'application/json'; UseBasicParsing = $true; Headers = @{} }
    if ($token) { $p.Headers.Authorization = "Bearer $token" }
    if ($body)  { $p.Body = ($body | ConvertTo-Json -Depth 5) }
    try {
        $r = Invoke-WebRequest @p
        return @{ Status = [int]$r.StatusCode; Raw = $r.Content; Body = ($r.Content | ConvertFrom-Json) }
    } catch {
        $resp = $_.Exception.Response
        $raw = $null
        if ($resp) { $raw = (New-Object System.IO.StreamReader($resp.GetResponseStream())).ReadToEnd() }
        if (-not $raw -and $_.ErrorDetails.Message) { $raw = $_.ErrorDetails.Message }
        return @{ Status = [int]$resp.StatusCode; Raw = $raw; Body = $(if ($raw) { $raw | ConvertFrom-Json }) }
    }
}

function Check($name, $ok) {
    if ($ok) { "PASS  $name" } else { "FAIL  $name"; $script:fail++ }
}

$id = Get-Random
$a = (Call POST '/auth/register' $null @{ email = "a$id@example.com"; password = 'password123' }).Body.token
$b = (Call POST '/auth/register' $null @{ email = "b$id@example.com"; password = 'password123' }).Body.token

$soon = Call POST '/commissions' $a @{ title = 'Soon cheap'; platform = 'VGEN'; budget = 50; deadline = '2026-11-01T00:00:00Z'; sourceUrl = "https://vgen.co/o/$id"; metadata = @{ color = 'blue' } }
$null = Call POST '/commissions' $a @{ title = 'Late rich'; platform = 'TWITTER'; budget = 200; deadline = '2026-12-01T00:00:00Z' }

Check 'create returns 201'               ($soon.Status -eq 201)
Check 'deadline comes back as ISO text'  ($soon.Body.deadline -like '2026-11-01*')
Check 'metadata round-trips'             ($soon.Body.metadata.color -eq 'blue')
Check 'duplicate source url -> 409'      ((Call POST '/commissions' $a @{ title = 'dup'; platform = 'VGEN'; sourceUrl = "https://vgen.co/o/$id" }).Status -eq 409)
Check 'blank title -> 400'               ((Call POST '/commissions' $a @{ title = ''; platform = 'VGEN' }).Status -eq 400)
Check 'javascript: url -> 400'           ((Call POST '/commissions' $a @{ title = 'x'; platform = 'VGEN'; sourceUrl = 'javascript:alert(1)' }).Status -eq 400)
Check 'negative budget -> 400'           ((Call POST '/commissions' $a @{ title = 'x'; platform = 'VGEN'; budget = -5 }).Status -eq 400)
Check 'unknown platform -> 400'          ((Call POST '/commissions' $a @{ title = 'x'; platform = 'MYSPACE' }).Status -eq 400)
Check 'sort=deadline: soonest first'     ((Call GET '/commissions?sort=deadline' $a).Body[0].title -eq 'Soon cheap')
Check 'sort=budget: priciest first'      ((Call GET '/commissions?sort=budget' $a).Body[0].title -eq 'Late rich')
Check 'bad sort value -> 400'            ((Call GET '/commissions?sort=color' $a).Status -eq 400)
Check 'status filter keeps PENDING'      ((Call GET '/commissions?status=PENDING' $a).Body.Count -eq 2)
Check 'status filter drops COMPLETED'    ((Call GET '/commissions?status=COMPLETED' $a).Raw -eq '[]')
Check "other user sees nothing"          ((Call GET '/commissions' $b).Raw -eq '[]')
Check 'no token -> 401'                  ((Call GET '/commissions' $null).Status -eq 401)

$id1 = $soon.Body.id
$moved = Call PATCH "/commissions/$id1/status" $a @{ status = 'IN_PROGRESS' }
Check 'status change -> 200 + new status'   ($moved.Status -eq 200 -and $moved.Body.status -eq 'IN_PROGRESS')
Check 'status filter finds the moved one'   ((Call GET '/commissions?status=IN_PROGRESS' $a).Body.title -eq 'Soon cheap')
Check "other user can't change it -> 404"   ((Call PATCH "/commissions/$id1/status" $b @{ status = 'COMPLETED' }).Status -eq 404)
Check 'bad status value -> 400'             ((Call PATCH "/commissions/$id1/status" $a @{ status = 'DONE' }).Status -eq 400)

# --- notifications: the scheduler runs once a minute, so this waits up to ~70s ---
$c = (Call POST '/auth/register' $null @{ email = "c$id@example.com"; password = 'password123' }).Body.token
$due = (Get-Date).ToUniversalTime().AddHours(2).ToString('yyyy-MM-ddTHH:mm:ssZ')
$null = Call POST '/commissions' $b @{ title = 'Due in two hours'; platform = 'OTHER'; deadline = $due }
$unread = $null
for ($i = 0; $i -lt 14 -and -not $unread; $i++) {
    Start-Sleep 5
    $unread = (Call GET '/notifications/unread' $b).Body
}
Check 'scheduler creates an unread notification'  ($unread.title -eq 'Due in two hours')
Check "other users don't see it"                  ((Call GET '/notifications/unread' $c).Raw -eq '[]')
$null = Call POST '/notifications/read' $b @{ ids = @($unread.id) }
Check 'marked read -> unread is empty'            ((Call GET '/notifications/unread' $b).Raw -eq '[]')
Check 'empty ids -> 400'                          ((Call POST '/notifications/read' $b @{ ids = @() }).Status -eq 400)

# --- editing a deadline re-arms the notification (waits up to ~70s again) ---
$cid = $unread.commissionId
$later = (Get-Date).ToUniversalTime().AddHours(3).ToString('yyyy-MM-ddTHH:mm:ssZ')
$edit = Call PATCH "/commissions/$cid/deadline" $b @{ deadline = $later }
Check 'deadline edit -> 200 + new deadline'   ($edit.Status -eq 200 -and $edit.Body.deadline -like ($later.Substring(0, 13) + '*'))
$again = $null
for ($i = 0; $i -lt 14 -and -not $again; $i++) {
    Start-Sleep 5
    $again = (Call GET '/notifications/unread' $b).Body
}
Check 'edited deadline is notified again'     ($again.commissionId -eq $cid)
Check "other user can't edit it -> 404"       ((Call PATCH "/commissions/$cid/deadline" $c @{ deadline = $later }).Status -eq 404)
Check 'deadline can be cleared'               ((Call PATCH "/commissions/$cid/deadline" $b @{ deadline = $null }).Body.deadline -eq $null)

# --- error format: every failure is {status, message, fields} ---
$bad = Call POST '/commissions' $a @{ title = ''; platform = 'VGEN' }
Check 'validation: 400 + message + field detail'  ($bad.Status -eq 400 -and $bad.Body.message -eq 'Validation failed' -and $bad.Body.fields.title)
$dupe = Call POST '/commissions' $a @{ title = 'dup'; platform = 'VGEN'; sourceUrl = "https://vgen.co/o/$id" }
Check 'conflict: 409 + readable message'          ($dupe.Status -eq 409 -and $dupe.Body.message -eq 'Already tracked')
Check 'no token: 401 in the same shape'           ((Call GET '/commissions' $null).Body.message -eq 'Not authenticated')
Check 'unknown path: 404 in the same shape'       ((Call GET '/no-such-path' $a).Body.status -eq 404)
Check 'wrong method: 405'                         ((Call DELETE '/commissions' $a).Status -eq 405)
Check 'bad filter value: 400'                     ((Call GET '/commissions?status=BOGUS' $a).Body.status -eq 400)
try { Invoke-WebRequest -Method Post -Uri "$base/commissions" -ContentType 'application/json' -Headers @{ Authorization = "Bearer $a" } -Body '{oops' -UseBasicParsing | Out-Null; $mal = 200 } catch { $mal = [int]$_.Exception.Response.StatusCode }
Check 'malformed JSON: 400'                       ($mal -eq 400)

# --- CORS: only the dashboard's origin may call the API from a browser ---
function Preflight($o) {
    try {
        $r = Invoke-WebRequest -Method Options -Uri "$base/commissions" -UseBasicParsing -Headers @{ Origin = $o; 'Access-Control-Request-Method' = 'GET'; 'Access-Control-Request-Headers' = 'authorization' }
        return $r.Headers['Access-Control-Allow-Origin']
    } catch { return $null }
}
Check 'CORS: a stranger site is refused' (-not (Preflight 'https://evil.example.com'))
if ($origin) { Check 'CORS: the dashboard origin is allowed' ((Preflight $origin) -eq $origin) }

if ($extOrigin) {
    try { Invoke-WebRequest -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Headers @{ Origin = $extOrigin } -Body '{"email":"nobody@example.com","password":"wrongpassword"}' -UseBasicParsing | Out-Null; $s = 200 } catch { $s = [int]$_.Exception.Response.StatusCode }
    Check 'extension origin is accepted (401 for bad login, not 403)' ($s -eq 401)
}

if ($fail) { "$fail check(s) FAILED"; exit 1 } else { 'All checks passed' }