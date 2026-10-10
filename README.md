# Ceyhan Tarım ortak takip sistemi

Mevcut HTML arayüzü, Netlify Database ve Netlify Identity ile ortak çalışan bir uygulamaya dönüştürüldü. Kayıtlar tarayıcıya değil, sunucudaki ortak veritabanına kaydedilir. Açık ekranlar internet bağlantısı varken beş saniyede bir değişiklikleri kontrol eder.

## İlk kullanım

1. Netlify yayını tamamlandıktan sonra siteyi açın. **Patron hesabı oluştur** seçeneğinden, kurulumda belirttiğiniz patron e-posta adresiyle hesabınızı oluşturun. E-posta doğrulama bağlantısını açın ve giriş yapın. Eski yerel yönetici şifresi artık kullanılmaz.
2. **Ayarlar & Yedekleme** bölümünden eski JSON yedeğinizi yükleyin. Önce mevcut ortak kayıtların yedeğini indirin: yükleme, tüm cihazlardaki kayıtların yerine geçer. Eski dosya bilgisayarda `file://` üzerinden kullanıldıysa JSON yedeğini o dosyadan indirin; web sitesi farklı tarayıcı kaynağındaki yerel kayıtları okuyamaz.
3. **Personel Hesapları** bölümünde personel adı ve e-postasıyla hesap ekleyin. Personel, gönderilen şifre belirleme bağlantısını açarak kendi şifresini oluşturur. E-posta gönderimi başarısızsa hesap listesindeki **Şifre bağlantısı** düğmesini kullanın.
4. Bilgisayar ve telefonlarda aynı siteyi açın ve kişisel hesaplarla giriş yapın.

## Yetkiler ve güvenilir kayıt

Patron tüm kayıtları yönetir. Personel traktörlerin marka, model, yıl, plaka, özellik/notlar ve müşteri satış fiyatını görür; sanayi masraflarını görüntüler ve yeni masraf ekler. Alış fiyatları, satıcı iletişim bilgileri, toplam maliyet, satış geçmişi, dükkan giderleri ve kâr bilgileri personel API yanıtına dahil edilmez. Personel kayıtları değiştiremez, silemez, yedek yükleyemez veya hesap yönetemez.

Herkese açık hesap oluşturma yalnızca belirlenen patron adresi için kabul edilir. Personel hesaplarını patron oluşturur. Yetkiler her istekte sunucuda güncel kullanıcı kaydıyla denetlenir. Erişimi kaldırılan bir personelin daha önce eklediği masraflar korunur.

Eşzamanlı patron işlemlerinde sürüm kontrolü, başka cihazın değişikliklerinin sessizce üzerine yazılmasını önler. Personel masrafları işlem kilidi altında ayrı ayrı eklenir. İnternet kesilirse yeni kayıt işlemleri durdurulur ve son alınan veriler gösterilir. Kaydetme onaylanmazsa form alanları korunur; patron kaydedilemeyen değişikliği ayrıca JSON olarak indirebilir. Kaydın gerçekleşip gerçekleşmediğini **Yenile** ile kontrol etmeden tekrar eklemeyin.

## Yayın yapılandırması

Netlify, `scripts/prepare-site.mjs` ile yalnızca HTML ve tarayıcı betiklerini `public/` dizinine hazırlar. Sunucu kaynakları ve yapılandırmalar bu dizinde yayınlanmaz. Netlify Functions, kimlik doğrulama ve veri işlemlerini gerçekleştirir. Netlify Identity etkinleştirme işareti projeye eklendi.

Veritabanı şeması `netlify/database/migrations/` altında tanımlandı; geçişi Netlify yayın sırasında uygular. Geçişi elle çalıştırmayın. Patron adresi sunucu yapılandırmasında tanımlıdır; gerektiğinde `CEYHAN_OWNER_EMAIL` ortam değişkeniyle değiştirilebilir. Önce patronun doğrulanmış hesabını oluşturun, ardından personel hesaplarını ekleyin.

Tip, sözdizimi ve sahte servislerle tarayıcı/sunucu senaryoları kontrol edildi. Gerçek Netlify yayını, veritabanı bağlantısı ve doğrulama e-postalarının teslimi bu yerel kontrollerle doğrulanmış sayılmaz; ilk yayından sonra iki cihazla giriş, masraf ekleme ve fiyat güncelleme akışlarını kontrol edin.
