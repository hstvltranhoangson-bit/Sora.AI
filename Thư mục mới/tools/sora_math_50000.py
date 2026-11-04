#!/usr/bin/env python3
"""Sinh tập ví dụ toán chính xác bằng công thức, không cần Internet/Ollama.

Chạy: python tools/sora_math_50000.py --count 50000
Tệp JSONL theo định dạng messages(user/assistant) của Sora. Đây là dữ liệu
tham khảo/huấn luyện có giám sát, KHÔNG tự sửa trọng số mô hình Ollama.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import dataclass
from fractions import Fraction as F
from pathlib import Path


@dataclass(frozen=True)
class Family:
    topic: str
    name: str
    formula: str
    generator: object


FAMILIES: list[Family] = []


def family(topic: str, name: str, formula: str):
    def decorator(fn):
        FAMILIES.append(Family(topic, name, formula, fn))
        return fn
    return decorator


def n(r, lo=-30, hi=30):
    return r.randint(lo, hi)


def nz(r, lo=-30, hi=30):
    value = 0
    while value == 0:
        value = n(r, lo, hi)
    return value


def fmt(value):
    if isinstance(value, F):
        return str(value.numerator) if value.denominator == 1 else f"{value.numerator}/{value.denominator}"
    return str(value)


def pack(question: str, steps: str, result, params: dict):
    return question, steps, fmt(result), params


@family('Số học', 'Tính phần trăm', 'A = p*x/100')
def percent(r):
    x, p = n(r, 20, 20000), n(r, 1, 95)
    v = F(x*p, 100)
    return pack(f"Tính {p}% của {x}.", f"{p}% của {x} = {x}*{p}/100 = {fmt(v)}.", v, dict(x=x,p=p))


@family('Số học', 'Tìm giá gốc trước giảm giá', 'Gốc = Giá_sau/(1-p/100)')
def base_price(r):
    original, p = n(r, 100, 40000), n(r, 1, 60)
    sale = F(original*(100-p), 100)
    return pack(f"Một món hàng sau khi giảm {p}% có giá {fmt(sale)} đồng. Giá gốc là bao nhiêu?",
                f"Giá gốc = {fmt(sale)}/(1-{p}/100) = {original} đồng.", original,
                dict(original=original,percent=p,sale=fmt(sale)))


@family('Số học', 'Tăng giá', 'Sau = Trước*(1+p/100)')
def increased(r):
    x, p = n(r, 70, 90000), n(r, 1, 80)
    v = F(x*(100+p),100)
    return pack(f"Giá {x} đồng tăng {p}%. Giá mới là bao nhiêu?",
                f"Giá mới = {x}*(100+{p})/100 = {fmt(v)} đồng.",v,dict(x=x,p=p))


@family('Tỉ lệ', 'Chia theo tỉ số', 'Phần_1 = Tổng*a/(a+b)')
def ratio_split(r):
    a,b,total=n(r,1,25),n(r,1,25),n(r,100,50000)
    v=F(total*a,a+b);w=F(total*b,a+b)
    return pack(f"Chia {total} đơn vị thành hai phần theo tỉ số {a}:{b}. Tìm mỗi phần.",
                f"Tổng phần = {a}+{b}={a+b}; phần 1 = {total}*{a}/{a+b}={fmt(v)}; "
                f"phần 2 = {total}*{b}/{a+b}={fmt(w)}.",f"{fmt(v)} và {fmt(w)}",dict(a=a,b=b,total=total))


@family('Tỉ lệ', 'Tỉ lệ thuận', 'y2 = y1*x2/x1')
def direct_ratio(r):
    x1,x2,y1=n(r,1,60),n(r,1,120),n(r,1,250)
    result=F(y1*x2,x1)
    return pack(f"y tỉ lệ thuận với x. Khi x={x1} thì y={y1}. Tính y khi x={x2}.",
                f"y2 = {y1}*{x2}/{x1} = {fmt(result)}.",result,dict(x1=x1,x2=x2,y1=y1))


@family('Tỉ lệ', 'Tỉ lệ nghịch', 'y2 = y1*x1/x2')
def inverse_ratio(r):
    x1,x2,y1=n(r,1,80),n(r,1,80),n(r,1,500)
    v=F(y1*x1,x2)
    return pack(f"y tỉ lệ nghịch với x. x={x1} ứng với y={y1}. x={x2} ứng với y bằng bao nhiêu?",
                f"x1*y1=x2*y2 nên y2={y1}*{x1}/{x2}={fmt(v)}.",v,dict(x1=x1,x2=x2,y1=y1))


@family('Chuyển động', 'Quãng đường', 's = v*t')
def speed(r):
    v,t=n(r,2,160),n(r,1,40)
    return pack(f"Một xe đi đều {v} km/h trong {t} giờ. Tính quãng đường.",
                f"s = v*t = {v}*{t} = {v*t} km.",v*t,dict(v=v,t=t))


@family('Thống kê', 'Trung bình có trọng số', 'M = (w1*x1+w2*x2)/(w1+w2)')
def weighted(r):
    a,b,wa,wb=n(r,1,100),n(r,1,100),n(r,1,15),n(r,1,15)
    v=F(wa*a+wb*b,wa+wb)
    return pack(f"Giá trị {a} có trọng số {wa}, giá trị {b} có trọng số {wb}. Tính trung bình có trọng số.",
                f"M=({wa}*{a}+{wb}*{b})/({wa}+{wb})={fmt(v)}.",v,dict(a=a,b=b,wa=wa,wb=wb))


@family('Tài chính', 'Lãi đơn', 'I = P*r*t/100')
def simple_interest(r):
    p,rate,t=n(r,1000,100000),n(r,1,25),n(r,1,20)
    v=F(p*rate*t,100)
    return pack(f"Gửi {p} đồng, lãi đơn {rate}%/năm trong {t} năm. Tiền lãi là bao nhiêu?",
                f"I=P*r*t/100={p}*{rate}*{t}/100={fmt(v)} đồng (chưa gồm vốn).",v,dict(p=p,rate=rate,t=t))


@family('Tài chính', 'Lãi kép', 'A = P*(1+r/100)^t')
def compound(r):
    p,rate,t=n(r,100,100000),n(r,1,18),n(r,1,8)
    amount=F(p)*F(100+rate,100)**t
    approx=round(float(amount),2)
    return pack(f"Gửi {p} đồng với lãi kép {rate}%/năm trong {t} năm. Tính số tiền cuối kì (làm tròn 2 chữ số).",
                f"A={p}*(1+{rate}/100)^{t}≈{approx:.2f} đồng.",f"{approx:.2f}",dict(p=p,rate=rate,t=t))


@family('Đại số', 'Phương trình bậc nhất', 'ax+b=c => x=(c-b)/a, a!=0')
def linear1(r):
    a,b,x=nz(r,-20,20),n(r),n(r,-50,50)
    c=a*x+b
    return pack(f"Giải {a}x + ({b}) = {c}.",
                f"{a}x={c}-({b})={a*x}; x=({c}-{b})/{a}={x}.",x,dict(a=a,b=b,c=c))


@family('Đại số', 'Ẩn cả hai vế', '(a-c)x=d-b, a!=c')
def linear2(r):
    a,c=n(r,-20,20),n(r,-20,20)
    if a==c:c+=1
    b,x=n(r,-80,80),n(r,-50,50)
    d=(a-c)*x+b
    return pack(f"Giải {a}x + ({b}) = {c}x + ({d}).",
                f"({a}-{c})x={d}-{b}={d-b} => x={x}.",x,dict(a=a,b=b,c=c,d=d))


@family('Đại số', 'Phương trình bậc hai', 'ax^2+bx+c=0; x=(-b±sqrt(b^2-4ac))/(2a)')
def quadratic(r):
    x1,x2=sorted(r.sample(range(-45,46),2)); a=n(r,1,14)
    b=-a*(x1+x2);c=a*x1*x2
    d=b*b-4*a*c
    assert d==(a*(x2-x1))**2
    return pack(f"Giải phương trình {a}x^2 + ({b})x + ({c})=0.",
                f"Delta=b^2-4ac=({b})^2-4*{a}*({c})={d}; "
                f"x=(-b±sqrt(Delta))/(2a) => x1={x1}, x2={x2}.",
                f"x={x1} hoặc x={x2}",dict(a=a,b=b,c=c,delta=d))


@family('Đại số', 'Hệ hai phương trình', 'D=ad-bc; x=(ed-bf)/D; y=(af-ec)/D')
def linear_system(r):
    while True:
        a,b,c,d=[n(r,-12,12) for _ in range(4)]
        if a*d!=b*c:
            break
    x,y=n(r,-35,35),n(r,-35,35)
    e,f=a*x+b*y,c*x+d*y
    D=a*d-b*c
    assert D!=0
    return pack(f"Giải hệ: {a}x+({b})y={e}; {c}x+({d})y={f}.",
                f"Định thức D={a}*{d}-({b})*{c}={D}≠0; "
                f"x=({e}*{d}-({b})*{f})/{D}={x}; y=({a}*{f}-{e}*{c})/{D}={y}.",
                f"x={x}, y={y}",dict(a=a,b=b,c=c,d=d,e=e,f=f))


@family('Đại số', 'Hiệu hai bình phương', 'a^2-b^2=(a-b)(a+b)')
def diff_sq(r):
    a,b=n(r,2,250),n(r,1,250)
    return pack(f"Phân tích {a}^2 - {b}^2 thành tích và tính giá trị.",
                f"({a}-{b})({a}+{b})={a-b}*{a+b}={a*a-b*b}.",a*a-b*b,dict(a=a,b=b))


@family('Đại số', 'Bình phương một tổng', '(a+b)^2=a^2+2ab+b^2')
def sum_sq(r):
    a,b=n(r,-150,150),n(r,-150,150)
    return pack(f"Khai triển ({a}+({b}))^2 và tính kết quả.",
                f"a^2+2ab+b^2={a*a}+2*({a})*({b})+{b*b}={(a+b)**2}.",(a+b)**2,dict(a=a,b=b))


@family('Phân số', 'Cộng phân số', 'a/b+c/d=(ad+bc)/(bd)')
def frac_add(r):
    a,b,c,d=n(r,-60,60),n(r,1,80),n(r,-60,60),n(r,1,80)
    v=F(a,b)+F(c,d)
    return pack(f"Tính {a}/{b} + {c}/{d}.",
                f"({a}*{d}+{c}*{b})/({b}*{d})={fmt(v)} (đã rút gọn).",v,dict(a=a,b=b,c=c,d=d))


@family('Phân số', 'Trừ phân số', 'a/b-c/d=(ad-bc)/(bd)')
def frac_sub(r):
    a,b,c,d=n(r,-70,70),n(r,1,90),n(r,-70,70),n(r,1,90)
    v=F(a,b)-F(c,d)
    return pack(f"Tính {a}/{b} - {c}/{d}.",
                f"({a}*{d}-{b}*{c})/({b}*{d})={fmt(v)}.",v,dict(a=a,b=b,c=c,d=d))


@family('Phân số', 'Nhân phân số', '(a/b)(c/d)=ac/bd')
def frac_mul(r):
    a,b,c,d=n(r,-70,70),n(r,1,60),n(r,-70,70),n(r,1,60)
    v=F(a,b)*F(c,d)
    return pack(f"Tính ({a}/{b})*({c}/{d}).",
                f"({a}*{c})/({b}*{d})={fmt(v)}.",v,dict(a=a,b=b,c=c,d=d))


@family('Phân số', 'Chia phân số', '(a/b)/(c/d)=ad/bc, c!=0')
def frac_div(r):
    a,b,c,d=n(r,-70,70),n(r,1,80),nz(r,-70,70),n(r,1,80)
    v=F(a,b)/F(c,d)
    return pack(f"Tính ({a}/{b}) : ({c}/{d}).",
                f"Đổi chia thành nhân nghịch đảo: ({a}*{d})/({b}*{c})={fmt(v)}.",v,dict(a=a,b=b,c=c,d=d))


@family('Lũy thừa', 'Nhân cùng cơ số', 'a^m*a^n=a^(m+n)')
def power_mul(r):
    a,m,k=n(r,2,18),n(r,1,9),n(r,1,9)
    return pack(f"Tính {a}^{m} * {a}^{k}.",
                f"Cùng cơ số, cộng số mũ: {a}^({m}+{k})={a**(m+k)}.",a**(m+k),dict(a=a,m=m,n=k))


@family('Lũy thừa', 'Chia cùng cơ số', 'a^m/a^n=a^(m-n), a!=0')
def power_div(r):
    a,k=n(r,2,25),n(r,1,15);m=n(r,k,k+12)
    return pack(f"Tính {a}^{m} / {a}^{k}.",
                f"Cùng cơ số, trừ số mũ: {a}^({m}-{k})={a**(m-k)}.",a**(m-k),dict(a=a,m=m,n=k))


@family('Căn thức', 'Căn bậc hai số chính phương', 'sqrt(a^2)=|a|')
def square_root(r):
    a=n(r,1,100000)
    return pack(f"Tính căn bậc hai số học của {a*a}.",
                f"{a*a}={a}^2, nên sqrt({a*a})={a} (căn số học không âm).",a,dict(a=a))


@family('Dãy số', 'Số hạng cấp số cộng', 'u_n=u_1+(n-1)d')
def ap_term(r):
    a,d,k=n(r,-100,100),nz(r,-25,25),n(r,2,150)
    v=a+(k-1)*d
    return pack(f"Cấp số cộng u1={a}, công sai d={d}. Tìm u{k}.",
                f"u{k}=u1+({k}-1)d={a}+({k}-1)*({d})={v}.",v,dict(u1=a,d=d,n=k))


@family('Dãy số', 'Tổng cấp số cộng', 'S_n=n(2u_1+(n-1)d)/2')
def ap_sum(r):
    a,d,k=n(r,-80,80),nz(r,-20,20),n(r,2,100)
    v=F(k*(2*a+(k-1)*d),2)
    return pack(f"Tính tổng {k} số hạng đầu của CSC u1={a}, d={d}.",
                f"S{k}={k}*(2*{a}+({k}-1)*({d}))/2={fmt(v)}.",v,dict(u1=a,d=d,n=k))


@family('Dãy số', 'Số hạng cấp số nhân', 'u_n=u_1*q^(n-1)')
def gp_term(r):
    a,q,k=nz(r,-30,30),r.choice([-4,-3,-2,2,3,4]),n(r,2,14)
    v=a*q**(k-1)
    return pack(f"Cấp số nhân có u1={a}, công bội q={q}. Tìm u{k}.",
                f"u{k}=u1*q^({k}-1)={a}*({q})^{k-1}={v}.",v,dict(u1=a,q=q,n=k))


@family('Dãy số', 'Tổng cấp số nhân', 'S_n=u_1*(q^n-1)/(q-1), q!=1')
def gp_sum(r):
    a,q,k=nz(r,-30,30),r.choice([-4,-3,-2,2,3,4]),n(r,2,12)
    v=F(a*(q**k-1),q-1)
    return pack(f"Tính tổng {k} số hạng đầu của CSN u1={a}, q={q}.",
                f"S{k}={a}*(({q})^{k}-1)/({q}-1)={fmt(v)}.",v,dict(u1=a,q=q,n=k))


@family('Hình học phẳng', 'Diện tích chữ nhật', 'S=a*b')
def rect_area(r):
    a,b=n(r,1,1000),n(r,1,1000)
    return pack(f"Hình chữ nhật dài {a} cm, rộng {b} cm. Tính diện tích.",
                f"S={a}*{b}={a*b} cm^2.",a*b,dict(a=a,b=b))


@family('Hình học phẳng', 'Chu vi chữ nhật', 'P=2(a+b)')
def rect_perimeter(r):
    a,b=n(r,1,1000),n(r,1,1000)
    return pack(f"Hình chữ nhật hai cạnh {a} m và {b} m. Tính chu vi.",
                f"P=2*({a}+{b})={2*(a+b)} m.",2*(a+b),dict(a=a,b=b))


@family('Hình học phẳng', 'Diện tích tam giác', 'S=ah/2')
def triangle_area(r):
    a,h=n(r,1,500),n(r,1,500)
    v=F(a*h,2)
    return pack(f"Tam giác có đáy {a} cm, chiều cao tương ứng {h} cm. Tính diện tích.",
                f"S=a*h/2={a}*{h}/2={fmt(v)} cm^2.",v,dict(a=a,h=h))


@family('Hình học phẳng', 'Diện tích hình thang', 'S=(a+b)h/2')
def trapezoid(r):
    a,b,h=n(r,1,300),n(r,1,300),n(r,1,200)
    v=F((a+b)*h,2)
    return pack(f"Hình thang có hai đáy {a} cm, {b} cm và chiều cao {h} cm. Tính diện tích.",
                f"S=({a}+{b})*{h}/2={fmt(v)} cm^2.",v,dict(a=a,b=b,h=h))


@family('Hình học phẳng', 'Diện tích bình hành', 'S=ah')
def parallelogram(r):
    a,h=n(r,1,700),n(r,1,600)
    return pack(f"Hình bình hành có đáy {a} cm và chiều cao {h} cm. Tìm diện tích.",
                f"S={a}*{h}={a*h} cm^2.",a*h,dict(a=a,h=h))


@family('Hình học tròn', 'Diện tích hình tròn', 'S=pi*r^2')
def circle_area(r):
    radius=n(r,1,100000)
    return pack(f"Hình tròn bán kính {radius} cm có diện tích chính xác bằng bao nhiêu (theo pi)?",
                f"S=pi*{radius}^2={radius**2}pi cm^2.",f"{radius**2}pi cm^2",dict(r=radius))


@family('Hình học tròn', 'Chu vi hình tròn', 'C=2*pi*r')
def circumference(r):
    radius=n(r,1,100000)
    return pack(f"Đường tròn có bán kính {radius} m. Viết chu vi theo pi.",
                f"C=2*pi*{radius}={2*radius}pi m.",f"{2*radius}pi m",dict(r=radius))


@family('Hình học không gian', 'Thể tích hình trụ', 'V=pi*r^2*h')
def cylinder(r):
    radius,h=n(r,1,150),n(r,1,150)
    v=radius*radius*h
    return pack(f"Hình trụ có bán kính đáy {radius} cm và cao {h} cm. Tính thể tích theo pi.",
                f"V=pi*r^2*h=pi*{radius}^2*{h}={v}pi cm^3.",f"{v}pi cm^3",dict(r=radius,h=h))


@family('Hình học không gian', 'Thể tích hình cầu', 'V=4*pi*r^3/3')
def sphere(r):
    radius=n(r,1,1000)
    v=F(4*radius**3,3)
    return pack(f"Khối cầu bán kính {radius} cm có thể tích bao nhiêu (theo pi)?",
                f"V=(4/3)*pi*{radius}^3={fmt(v)}pi cm^3.",f"{fmt(v)}pi cm^3",dict(r=radius))


@family('Hình học không gian', 'Thể tích hộp chữ nhật', 'V=abc')
def box_volume(r):
    a,b,c=n(r,1,200),n(r,1,200),n(r,1,200)
    return pack(f"Hộp chữ nhật có 3 kích thước {a}, {b}, {c} cm. Tính thể tích.",
                f"V={a}*{b}*{c}={a*b*c} cm^3.",a*b*c,dict(a=a,b=b,c=c))


@family('Tam giác', 'Định lý Pythagoras', 'c=sqrt(a^2+b^2), tam giác vuông')
def pythagoras(r):
    m,k=n(r,2,100),n(r,1,60)
    a,b,c=(m*m-1)*k,2*m*k,(m*m+1)*k
    assert a*a+b*b==c*c
    return pack(f"Tam giác vuông có hai cạnh góc vuông {a} cm, {b} cm. Tính cạnh huyền.",
                f"c=sqrt({a}^2+{b}^2)=sqrt({c*c})={c} cm.",c,dict(a=a,b=b))


@family('Hình học giải tích', 'Khoảng cách hai điểm', 'd=sqrt((x2-x1)^2+(y2-y1)^2)')
def distance(r):
    x1,y1=n(r,-250,250),n(r,-250,250)
    dx,dy=nz(r,-140,140),nz(r,-140,140)
    x2,y2=x1+dx,y1+dy
    square=dx*dx+dy*dy
    return pack(f"Tính khoảng cách giữa A({x1},{y1}) và B({x2},{y2}).",
                f"AB=sqrt(({x2}-{x1})^2+({y2}-{y1})^2)=sqrt({square}) "
                f"≈{math.sqrt(square):.4f}.",f"sqrt({square})",dict(x1=x1,y1=y1,x2=x2,y2=y2))


@family('Hình học giải tích', 'Trung điểm', 'M=((x1+x2)/2,(y1+y2)/2)')
def midpoint(r):
    x1,x2,y1,y2=[n(r,-500,500) for _ in range(4)]
    x,y=F(x1+x2,2),F(y1+y2,2)
    return pack(f"Tìm trung điểm của A({x1},{y1}) và B({x2},{y2}).",
                f"M=(({x1}+{x2})/2,({y1}+{y2})/2)=({fmt(x)},{fmt(y)}).",
                f"({fmt(x)},{fmt(y)})",dict(x1=x1,x2=x2,y1=y1,y2=y2))


@family('Hình học giải tích', 'Hệ số góc', 'm=(y2-y1)/(x2-x1), x1!=x2')
def slope(r):
    x1,y1=n(r,-200,200),n(r,-200,200)
    dx,dy=nz(r,-100,100),n(r,-200,200)
    x2,y2=x1+dx,y1+dy;m=F(dy,dx)
    return pack(f"Đường thẳng đi qua A({x1},{y1}), B({x2},{y2}). Tìm hệ số góc.",
                f"m=({y2}-{y1})/({x2}-{x1})={fmt(m)}.",m,dict(x1=x1,y1=y1,x2=x2,y2=y2))


@family('Hình học giải tích', 'Phương trình đường thẳng', 'y=mx+b; b=y0-mx0')
def line_equation(r):
    m,b,x0=n(r,-30,30),n(r,-60,60),n(r,-200,200)
    y0=m*x0+b
    return pack(f"Tìm phương trình y=mx+b có hệ số góc {m}, qua ({x0},{y0}).",
                f"b=y0-m*x0={y0}-{m}*({x0})={b}; phương trình y={m}x+({b}).",
                f"y={m}x+({b})",dict(m=m,x0=x0,y0=y0))


@family('Vectơ', 'Tích vô hướng', 'u.v=x1*x2+y1*y2')
def dot(r):
    x1,x2,y1,y2=[n(r,-100,100) for _ in range(4)]
    v=x1*x2+y1*y2
    return pack(f"Tính tích vô hướng u=({x1},{y1}), v=({x2},{y2}).",
                f"u.v={x1}*{x2}+{y1}*{y2}={v}.",v,dict(x1=x1,y1=y1,x2=x2,y2=y2))


@family('Vectơ', 'Độ dài vectơ', '|v|=sqrt(x^2+y^2)')
def vector_norm(r):
    x,y=n(r,-500,500),n(r,-500,500)
    square=x*x+y*y
    return pack(f"Vectơ v=({x},{y}) có độ dài là bao nhiêu?",
                f"|v|=sqrt({x}^2+({y})^2)=sqrt({square})≈{math.sqrt(square):.4f}.",
                f"sqrt({square})",dict(x=x,y=y))


@family('Tổ hợp', 'Chỉnh hợp', 'A(n,k)=n!/(n-k)!')
def permutations(r):
    n_=n(r,5,100);k=n(r,1,min(10,n_));v=math.perm(n_,k)
    return pack(f"Có {n_} phần tử phân biệt. Có bao nhiêu cách chọn và sắp thứ tự {k} phần tử?",
                f"A({n_},{k})={n_}!/({n_}-{k})!={v}.",v,dict(n=n_,k=k))


@family('Tổ hợp', 'Tổ hợp', 'C(n,k)=n!/[k!(n-k)!]')
def combinations(r):
    n_=n(r,20,150);k=n(r,1,min(15,n_));v=math.comb(n_,k)
    return pack(f"Chọn {k} phần tử từ {n_} phần tử phân biệt (không xét thứ tự). Có bao nhiêu cách?",
                f"C({n_},{k})={n_}!/({k}!({n_}-{k})!)={v}.",v,dict(n=n_,k=k))


@family('Xác suất', 'Xác suất cổ điển', 'P(A)=số_kết_quả_thuận_lợi/tổng_số')
def probability(r):
    good,bad=n(r,1,1000),n(r,1,1000)
    v=F(good,good+bad)
    return pack(f"Hộp có {good} bi đỏ, {bad} bi xanh. Lấy đều ngẫu nhiên 1 bi. Xác suất lấy bi đỏ?",
                f"P(đỏ)={good}/({good}+{bad})={fmt(v)}.",v,dict(good=good,bad=bad))


@family('Xác suất', 'Xác suất có điều kiện', 'P(A|B)=P(A giao B)/P(B)')
def conditional(r):
    both,only_b=n(r,1,500),n(r,1,800)
    v=F(both,both+only_b)
    return pack(f"Trong {both+only_b} trường hợp thỏa B, có {both} trường hợp đồng thời thỏa A. Tìm P(A|B).",
                f"P(A|B)=n(A∩B)/n(B)={both}/{both+only_b}={fmt(v)} "
                f"(giả sử các trường hợp trong B đồng khả năng).",v,dict(both=both,only_b=only_b))


@family('Xác suất', 'Hai biến cố độc lập', 'P(A giao B)=P(A)P(B)')
def independent(r):
    a,b,c,d=n(r,1,60),n(r,1,60),n(r,1,60),n(r,1,60)
    x,y=F(a,a+b),F(c,c+d);v=x*y
    return pack(f"Hai biến cố độc lập có P(A)={fmt(x)}, P(B)={fmt(y)}. Tìm P(A và B).",
                f"Vì độc lập: P(A∩B)=P(A)*P(B)={fmt(x)}*{fmt(y)}={fmt(v)}.",v,
                dict(a=a,b=b,c=c,d=d))


@family('Thống kê', 'Trung bình cộng', 'mean=sum(x_i)/n')
def mean(r):
    data=[n(r,-200,200) for _ in range(5)]
    v=F(sum(data),len(data))
    return pack(f"Tính trung bình của 5 số: {', '.join(map(str,data))}.",
                f"mean=({'+'.join(map(str,data))})/5={fmt(v)}.",v,dict(data=data))


@family('Thống kê', 'Phương sai tổng thể', 'var=sum((x_i-mean)^2)/n')
def variance(r):
    data=[n(r,-80,80) for _ in range(4)]
    mu=F(sum(data),4);v=sum((F(x)-mu)**2 for x in data)/4
    return pack(f"Tính phương sai TỔNG THỂ của 4 số: {', '.join(map(str,data))}.",
                f"mean={fmt(mu)}; var=sum((xi-{fmt(mu)})^2)/4={fmt(v)} "
                "(chia n=4, không chia n-1).",v,dict(data=data))


@family('Giải tích', 'Đạo hàm đơn thức', "d(ax^n)/dx=a*n*x^(n-1)")
def derivative_monomial(r):
    a,m,t=nz(r,-25,25),n(r,1,12),n(r,-15,15)
    v=a*m*t**(m-1)
    return pack(f"Cho f(x)={a}x^{m}. Tính f'({t}).",
                f"f'(x)={a*m}x^{m-1}; f'({t})={a*m}*({t})^{m-1}={v}.",v,dict(a=a,n=m,x=t))


@family('Giải tích', 'Đạo hàm đa thức', "d(ax^n+bx+c)/dx=anx^(n-1)+b")
def derivative_poly(r):
    a,m,b,c,t=nz(r,-15,15),n(r,2,8),n(r,-50,50),n(r,-50,50),n(r,-15,15)
    v=a*m*t**(m-1)+b
    return pack(f"Cho f(x)={a}x^{m}+({b})x+({c}). Tính f'({t}).",
                f"f'(x)={a*m}x^{m-1}+({b}); f'({t})={v}.",v,
                dict(a=a,n=m,b=b,c=c,x=t))


@family('Giải tích', 'Tích phân xác định hàm bậc nhất', 'Integral_a^b (mx+c)dx=[mx^2/2+cx]_a^b')
def integral_linear(r):
    m,c=n(r,-30,30),n(r,-30,30);lo=n(r,-30,10);hi=lo+n(r,1,30)
    v=F(m*(hi*hi-lo*lo),2)+c*(hi-lo)
    return pack(f"Tính tích phân từ {lo} đến {hi} của ({m}x+({c})) dx.",
                f"Nguyên hàm F(x)=({m}/2)x^2+({c})x. F({hi})-F({lo})={fmt(v)}.",
                v,dict(m=m,c=c,lo=lo,hi=hi))


@family('Giải tích', 'Tích phân xác định bậc hai', 'Integral_a^b (mx^2+nx+c)dx=[mx^3/3+nx^2/2+cx]_a^b')
def integral_quadratic(r):
    m,b,c=n(r,-15,15),n(r,-15,15),n(r,-15,15)
    lo=n(r,-20,10);hi=lo+n(r,1,25)
    v=F(m*(hi**3-lo**3),3)+F(b*(hi*hi-lo*lo),2)+c*(hi-lo)
    return pack(f"Tính tích phân từ {lo} đến {hi} của ({m}x^2+({b})x+({c})) dx.",
                f"Nguyên hàm = ({m}/3)x^3+({b}/2)x^2+({c})x. "
                f"Thế cận {lo}, {hi} được {fmt(v)}.",v,dict(m=m,b=b,c=c,lo=lo,hi=hi))


@family('Logarit', 'Phương trình lũy thừa', 'a^x=b, b=a^k => x=k, a>0,a!=1')
def exponent_equation(r):
    a,k=n(r,2,18),n(r,1,10)
    v=a**k
    return pack(f"Giải {a}^x={v} (x thực).",
                f"{v}={a}^{k}, cơ số {a}>0 và ≠1 nên x={k}.",k,dict(a=a,k=k,b=v))


@family('Lượng giác', 'Giá trị sin của góc đặc biệt', 'sin(theta)')
def sine_special(r):
    angle,value=r.choice([(0,F(0)),(30,F(1,2)),(90,F(1)),(150,F(1,2)),
                          (180,F(0)),(210,F(-1,2)),(270,F(-1)),(330,F(-1,2))])
    length=n(r,1,10000);v=value*length
    return pack(f"Tính {length}*sin({angle} độ) chính xác.",
                f"sin({angle}°)={fmt(value)} nên kết quả {length}*{fmt(value)}={fmt(v)}.",
                v,dict(angle=angle,k=length))


@family('Lượng giác', 'Giá trị cos của góc đặc biệt', 'cos(theta)')
def cosine_special(r):
    angle,value=r.choice([(0,F(1)),(60,F(1,2)),(90,F(0)),(120,F(-1,2)),
                          (180,F(-1)),(240,F(-1,2)),(270,F(0)),(300,F(1,2))])
    length=n(r,1,10000);v=value*length
    return pack(f"Tính {length}*cos({angle} độ) chính xác.",
                f"cos({angle}°)={fmt(value)} nên kết quả {length}*{fmt(value)}={fmt(v)}.",
                v,dict(angle=angle,k=length))


@family('Tam giác', 'Định lý cos', 'c^2=a^2+b^2-2ab*cos(C)')
def cosine_law(r):
    a,b=n(r,2,300),n(r,2,300)
    angle,cos=r.choice([(60,F(1,2)),(90,F(0)),(120,F(-1,2))])
    v=F(a*a+b*b)-2*a*b*cos
    assert v>0 and v.denominator==1
    return pack(f"Hai cạnh tam giác dài {a} cm và {b} cm kẹp góc {angle}°. Tính cạnh đối diện góc đó.",
                f"c^2={a}^2+{b}^2-2*{a}*{b}*cos({angle}°)={fmt(v)}; "
                f"c=sqrt({fmt(v)})≈{math.sqrt(v):.4f} cm.",
                f"sqrt({fmt(v)}) cm",dict(a=a,b=b,angle=angle))


@family('Vật lí', 'Khối lượng từ khối lượng riêng', 'm=rho*V')
def density(r):
    rho,volume=n(r,1,22000),n(r,1,2000)
    return pack(f"Chất có khối lượng riêng {rho} kg/m^3, thể tích {volume} m^3. Tính khối lượng.",
                f"m=rho*V={rho}*{volume}={rho*volume} kg.",rho*volume,dict(rho=rho,V=volume))


@family('Năng suất', 'Hai người cùng làm', '1/T=1/a+1/b')
def work_rate(r):
    a,b=n(r,2,200),n(r,2,200)
    v=F(a*b,a+b)
    return pack(f"Người A làm riêng hết {a} giờ, người B hết {b} giờ. Cùng làm đều thì xong sau bao lâu?",
                f"1/T=1/{a}+1/{b}, nên T={a}*{b}/({a}+{b})={fmt(v)} giờ.",v,dict(a=a,b=b))


@family('Pha trộn', 'Nồng độ dung dịch', 'C=(m1*c1+m2*c2)/(m1+m2)')
def mixture(r):
    m1,m2,c1,c2=n(r,1,400),n(r,1,400),n(r,1,80),n(r,1,80)
    v=F(m1*c1+m2*c2,m1+m2)
    return pack(f"Trộn {m1} g dung dịch {c1}% với {m2} g dung dịch {c2}%. "
                "Giả sử không hao hụt, tìm nồng độ phần trăm cuối.",
                f"C=({m1}*{c1}+{m2}*{c2})/({m1}+{m2})={fmt(v)}%.",
                f"{fmt(v)}%",dict(m1=m1,m2=m2,c1=c1,c2=c2))


@family('Số học', 'Ước chung lớn nhất', 'gcd(a,b) theo Euclid')
def gcd_problem(r):
    a,b=n(r,2,100000),n(r,2,100000);v=math.gcd(a,b)
    return pack(f"Tìm UCLN({a},{b}).",f"Thuật toán Euclid cho UCLN({a},{b})={v}.",
                v,dict(a=a,b=b))


@family('Số học', 'Bội chung nhỏ nhất', 'lcm(a,b)=a*b/gcd(a,b)')
def lcm_problem(r):
    a,b=n(r,2,15000),n(r,2,15000);g=math.gcd(a,b);v=a*b//g
    return pack(f"Tìm BCNN({a},{b}).",f"UCLN({a},{b})={g}; "
                f"BCNN=({a}*{b})/{g}={v}.",v,dict(a=a,b=b))


@family('Đổi đơn vị', 'Tốc độ km/h sang m/s', 'm/s=km/h*5/18')
def speed_conversion(r):
    v=n(r,1,20000);x=F(5*v,18)
    return pack(f"Đổi {v} km/h sang m/s.",f"{v}*(1000/3600)={fmt(x)} m/s.",
                f"{fmt(x)} m/s",dict(v=v))


@family('Bản đồ', 'Tỉ lệ bản đồ', 'Thực_tế(cm)=Trên_bản_đồ(cm)*M')
def map_scale(r):
    cm=n(r,1,5000);scale=n(r,1,5000)*100
    v=F(cm*scale,100000)
    return pack(f"Bản đồ tỉ lệ 1:{scale}. Đo được {cm} cm. Quãng đường thực tế bao nhiêu km?",
                f"{cm}*{scale} cm /100000={fmt(v)} km.",f"{fmt(v)} km",dict(cm=cm,scale=scale))


@family('Hình học không gian', 'Diện tích toàn phần hình lập phương', 'S=6a^2')
def cube_surface(r):
    a=n(r,1,100000);v=6*a*a
    return pack(f"Lập phương cạnh {a} cm có diện tích toàn phần bao nhiêu?",
                f"S=6*{a}^2={v} cm^2.",v,dict(a=a))


@family('Hình học không gian', 'Thể tích hình nón', 'V=pi*r^2*h/3')
def cone_volume(r):
    radius,h=n(r,1,500),n(r,1,500);v=F(radius*radius*h,3)
    return pack(f"Hình nón có bán kính {radius} cm và chiều cao {h} cm. Tính thể tích theo pi.",
                f"V=pi*{radius}^2*{h}/3={fmt(v)}pi cm^3.",
                f"{fmt(v)}pi cm^3",dict(r=radius,h=h))


@family('Số phức', 'Nhân số phức', '(a+bi)(c+di)=(ac-bd)+(ad+bc)i')
def complex_multiply(r):
    a,b,c,d=[n(r,-100,100) for _ in range(4)]
    real=a*c-b*d;imag=a*d+b*c
    return pack(f"Nhân ({a}+({b})i) * ({c}+({d})i).",
                f"Phần thực={a}*{c}-{b}*{d}={real}; phần ảo={a}*{d}+{b}*{c}={imag}; "
                f"kết quả {real}+({imag})i.",f"{real}+({imag})i",dict(a=a,b=b,c=c,d=d))


@family('Đại số', 'Giá trị biểu thức bậc hai', 'f(x)=ax^2+bx+c')
def eval_quadratic(r):
    a,b,c,x=n(r,-100,100),n(r,-100,100),n(r,-100,100),n(r,-100,100)
    v=a*x*x+b*x+c
    return pack(f"Cho f(x)={a}x^2+({b})x+({c}). Tính f({x}).",
                f"f({x})={a}*({x})^2+({b})*({x})+({c})={v}.",v,dict(a=a,b=b,c=c,x=x))


@family('Số học', 'Tổng số nguyên liên tiếp', '1+2+...+n=n(n+1)/2')
def natural_sum(r):
    k=n(r,1,100000);v=k*(k+1)//2
    return pack(f"Tính 1+2+...+{k}.",f"S={k}*({k}+1)/2={v}.",v,dict(n=k))


@family('Số học', 'Tổng bình phương', '1^2+...+n^2=n(n+1)(2n+1)/6')
def sum_squares(r):
    k=n(r,1,100000);v=k*(k+1)*(2*k+1)//6
    return pack(f"Tính 1^2+2^2+...+{k}^2.",
                f"S={k}*({k}+1)*(2*{k}+1)/6={v}.",v,dict(n=k))


def generate(count: int, dest: Path, seed: int, replace: bool):
    if count < 1 or count > 2_000_000:
        raise ValueError('Số mẫu phải trong khoảng 1..2.000.000')
    if dest.exists() and not replace:
        raise FileExistsError(f'{dest} đã tồn tại. Dùng --overwrite để ghi đè nếu thật sự cần.')
    dest.parent.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    seen: set[str] = set()
    counts = {f.name: 0 for f in FAMILIES}
    attempts = 0
    with dest.open('w', encoding='utf-8', newline='\n') as out:
        while len(seen) < count:
            f = FAMILIES[attempts % len(FAMILIES)]
            attempts += 1
            question, steps, result, variables = f.generator(rng)
            if question in seen:
                if attempts > count * 6:
                    raise RuntimeError('Không đủ mẫu độc lập; hãy đổi seed hoặc chọn count thấp hơn.')
                continue
            seen.add(question)
            counts[f.name] += 1
            answers = [
                f'Em áp dụng công thức {f.formula}.\n{steps}\nĐáp số: {result}.',
                f'Bài này dùng {f.formula}.\nThay số: {steps}\nKết quả là {result}.',
                f'Anh xem nhé, ta chọn {f.formula}.\n{steps}\nVậy đáp án: {result}.',
                f'Từ {f.formula}, em tính được:\n{steps}\nĐáp số: {result}.',
                f'Công thức cần dùng: {f.formula}.\n{steps}\nKết luận: {result}.',
            ]
            item = {
                'id': f'MATH-{len(seen):06d}',
                'topic': f.topic,
                'skill': f.name,
                'formula': f.formula,
                'variables': variables,
                'expected_answer': result,
                'messages': [
                    {'role': 'user', 'content': question},
                    {'role': 'assistant', 'content': answers[len(seen) % len(answers)]},
                ],
                'origin': 'synthetic_formula',
            }
            out.write(json.dumps(item, ensure_ascii=False, separators=(',', ':')) + '\n')
            if len(seen) % 10000 == 0:
                print(f'Đã tạo {len(seen):,}/{count:,} mẫu...', flush=True)
    return counts


def validate(dest: Path, expected: int | None = None):
    unique, totals, topics = set(), 0, set()
    with dest.open('r', encoding='utf-8') as source:
        for line in source:
            item = json.loads(line)
            turns = item.get('messages')
            if not isinstance(turns, list) or len(turns) != 2:
                raise ValueError('Định dạng messages không đúng')
            if turns[0].get('role') != 'user' or turns[1].get('role') != 'assistant':
                raise ValueError('Sai vai trò trong messages')
            question = turns[0].get('content')
            answer = turns[1].get('content')
            if not isinstance(question,str) or not isinstance(answer,str) or not question.strip() or not answer.strip():
                raise ValueError('Phát hiện câu hỏi/lời giải rỗng')
            if question in unique:
                raise ValueError(f'Mẫu trùng lặp: {question}')
            unique.add(question)
            topics.add(item['skill'])
            totals += 1
    if expected is not None and totals != expected:
        raise ValueError(f'Cần {expected} mẫu nhưng tệp có {totals} mẫu')
    print(f'ĐÃ KIỂM TRA: {totals:,} mẫu không trùng, {len(topics)} dạng công thức.')
    return totals


def main():
    parser = argparse.ArgumentParser(description='Tạo 50.000 bài toán cho dữ liệu tham khảo Sora')
    parser.add_argument('--count',type=int,default=50000)
    parser.add_argument('--seed',type=int,default=20261028)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1] / 'backend' / 'data' / 'sora_math_50000.jsonl')
    parser.add_argument('--catalog',type=Path,default=Path(__file__).resolve().parents[1] / 'backend' / 'data' / 'sora_math_formulas.json')
    parser.add_argument('--overwrite',action='store_true')
    parser.add_argument('--verify-only',action='store_true')
    args=parser.parse_args()
    print(f'Số nhóm công thức: {len(FAMILIES)}')
    if args.verify_only:
        validate(args.output,args.count)
        return
    counts=generate(args.count,args.output,args.seed,args.overwrite)
    validate(args.output,args.count)
    catalog = [{'topic': f.topic, 'skill': f.name, 'formula': f.formula,
                'examples': counts[f.name]} for f in FAMILIES]
    args.catalog.parent.mkdir(parents=True, exist_ok=True)
    if not args.catalog.exists() or args.overwrite:
        with args.catalog.open('w', encoding='utf-8') as output:
            json.dump(catalog, output, indent=2, ensure_ascii=False)
            output.write('\n')
    print(f'Đường dẫn: {args.output.resolve()}')
    print(f'Bảng công thức: {args.catalog.resolve()}')
    print(f'Dung lượng: {args.output.stat().st_size / 1024 / 1024:.1f} MiB')
    print(f'Nhóm ít nhất: {min(counts.values())} mẫu; nhóm nhiều nhất: {max(counts.values())} mẫu')
    print('Lưu ý: tập dữ liệu chưa tự động nạp vào trí nhớ hay fine-tune mô hình Ollama.')


if __name__ == '__main__':
    main()
