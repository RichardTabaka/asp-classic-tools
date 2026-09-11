<!-- #include file="header.asp" -->
<!-- #include file="lib/user.asp" -->
<!-- #include virtual="/shared/db.asp" -->
<%
' The virtual= include above is intentionally left unresolved (no web root
' configured) — try F12 or open the include tree to see how it's marked.

Function Main()
  Dim u
  u = GetUser("42")          ' F12 on GetUser jumps into lib/user.asp
  RenderHeader                ' F12 on RenderHeader jumps into header.asp
  Response.Write FormatDate(Now())  ' F12 on FormatDate jumps into lib/common.asp
End Function
%>
