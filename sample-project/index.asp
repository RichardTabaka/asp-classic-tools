<!-- #include file="header.asp" -->
<!-- #include file="lib/user.asp" -->
<!-- #include virtual="/shared/db.asp" -->
<%
' The virtual= include above is intentionally left unresolved (no web root
' configured) — try F12 or open the include tree to see how it's marked.
'
' IsAdmin and Helper below aren't reachable via this file's own include
' chain at all — they're defined in admin.asp's and reports.asp's separate
' trees (lib/adminHelpers.asp, lib/reportHelpers.asp). Calling them from
' here would genuinely error at runtime; they're wired up purely to exercise
' on-demand indexing (see README's "Indexing modes"):
'
'   1. With only index.asp open, F12 on IsAdmin fails with an info message —
'      admin.asp's chain hasn't been parsed yet (aspClassicTools.eagerIndex
'      is off by default).
'   2. Open admin.asp once (nothing else needed), come back, F12 on IsAdmin
'      again — now it resolves, since opening admin.asp pulled its whole
'      include chain into the cache.
'   3. Also open reports.asp, then F12 on Helper below — both admin.asp's
'      and reports.asp's lib files define an unrelated Helper(), so once
'      both are cached you get a two-candidate picker instead of a jump.

Function Main()
  Dim u
  u = GetUser("42")          ' F12 on GetUser jumps into lib/user.asp
  RenderHeader                ' F12 on RenderHeader jumps into header.asp
  Response.Write FormatDate(Now())  ' F12 on FormatDate jumps into lib/common.asp

  If IsAdmin(u) Then                 ' see steps 1-2 above
    Response.Write "<p>Welcome, admin.</p>"
  End If
  Response.Write Helper()            ' see step 3 above
End Function
%>
