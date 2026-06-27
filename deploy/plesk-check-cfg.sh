#!/usr/bin/env bash
set +e
D=single.storygen.jessicanaiara.com.br
CFG=/etc/httpd/conf/plesk.conf.d/vhosts/$D.conf
echo "=== ProxyPass no config gerado? ==="
grep -n ProxyPass "$CFG"
echo "=== includes (vhost.conf) ==="
grep -n -i "vhost.conf\|Include " "$CFG"
echo "=== DocumentRoot ==="
grep -n -i DocumentRoot "$CFG"
echo "=== conteudo do docroot ==="
DR=$(grep -m1 -i DocumentRoot "$CFG" | awk '{print $2}' | tr -d '\"')
echo "docroot=$DR"
ls -la "$DR" 2>&1 | head
echo "=== nosso vhost.conf existe? ==="
ls -la /var/www/vhosts/system/$D/conf/vhost.conf 2>&1
cat /var/www/vhosts/system/$D/conf/vhost.conf 2>&1
