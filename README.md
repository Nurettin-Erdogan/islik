# Islik

Kucuk servis isletmeleri icin yerel calisan is, musteri, takvim ve finans uygulamasi.

## Canli Uygulama

https://nurettin-erdogan.github.io/islik/

## Ozellikler

- Is olusturma, duzenleme, durum degistirme ve silme
- Bugun ve geciken is filtreleri
- Iptal edilen isler icin arsiv sutunu
- Gercek is kayitlarindan hesaplanan aylik finans ozeti
- Musteri listesi ve takvim gorunumu
- Teklif metni kopyalama ve WhatsApp taslagi
- JSON yedekleme/geri yukleme ve CSV finans aktarimi
- Mobil uyumlu PWA ve cevrimdisi uygulama kabugu

## Baslatma

Windows'ta `start-islik.cmd` dosyasina cift tiklayin.

Alternatif olarak terminalde:

```powershell
npm start
```

Ardindan `http://127.0.0.1:4173` adresini acin.

## Test

Uygulama acikken:

```powershell
npm test
```

Smoke testi; ilk kurulum, profil, is olusturma, durum degistirme, duzenleme,
iptal/arsiv, filtreleme, silme ve mobil tasma kontrollerini yapar.

## Veri guvenligi

Kayitlar tarayicinin yerel deposunda tutulur. Profil menusu altindaki **Yedegi indir**
secenegiyle duzenli JSON yedegi alin. Baska bir cihazda **Yedekten don** ile kayitlari
geri yukleyebilirsiniz.

Bu surum tek cihazli ve yerel calisir. Coklu kullanici, bulut senkronizasyonu ve
WhatsApp mesaj gonderimi icin daha sonra bir sunucu hesabi ve resmi API baglantisi gerekir.
