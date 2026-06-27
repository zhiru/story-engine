#!/usr/bin/env bash
set +e
echo "=== limite atual de subdominios ==="
plesk bin subscription --info jessicanaiara.com.br 2>/dev/null | grep -i subdom
echo "=== sobe limite p/ 50 ==="
plesk bin subscription --update jessicanaiara.com.br -max_subdom 50 2>&1 | tail -3
echo "=== remove multi meio-quebrado ==="
plesk bin subdomain --remove multi.storygen -domain jessicanaiara.com.br 2>&1 | tail -2
echo "=== cria single + multi ==="
plesk bin subdomain --create single.storygen -domain jessicanaiara.com.br 2>&1 | tail -2
plesk bin subdomain --create multi.storygen -domain jessicanaiara.com.br 2>&1 | tail -2
echo "=== vhosts Apache ==="
apachectl -S 2>/dev/null | grep storygen
echo "=== docroots ==="
ls -d /var/www/vhosts/jessicanaiara.com.br/*storygen* 2>&1
echo DONE
