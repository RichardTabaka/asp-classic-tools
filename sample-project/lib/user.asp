<!-- #include file="common.asp" -->
<%
Public Function GetUser(id)
  If id = "" Then
    LogError "missing id"          ' calls Sub defined in common.asp
  End If
  GetUser = "user-" & id
End Function
%>
